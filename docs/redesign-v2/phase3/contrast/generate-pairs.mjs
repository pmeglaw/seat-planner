// Generates the product contrast pairs for the ibm-design-language contrast checker.
//
//   node docs/redesign-v2/phase3/contrast/generate-pairs.mjs
//   python <skill>/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json
//
// Every drawn mark is listed with the surfaces it actually lands on (rest, hover,
// pressed, selected, highlight), per zone and per theme. The JSON files are output;
// never hand-edit them — add a mark or a surface here. `surface-pairs-not-gated.json`
// holds dividers, skeletons, hover steps and decorative gradients: measured, not gated.
//
// Values are the resolved hex of the tokens in tokens/carbon-tokens.css (palette + themes)
// so the checker can name the grades; PHASE3DS §3 quotes the command above.
import fs from "node:fs";
import path from "node:path";

const P = { // palette, as carbon-tokens.css
  white: "#ffffff", g10: "#f4f4f4", g20: "#e0e0e0", g30: "#c6c6c6", g40: "#a8a8a8", g50: "#8d8d8d", g60: "#6f6f6f", g70: "#525252", g80: "#393939", g90: "#262626", g100: "#161616",
  hoverWhite: "#e8e8e8", hoverG90: "#333333", hoverG100: "#292929", hoverG80: "#474747",
  b20: "#d0e2ff", b30: "#a6c8ff", b40: "#78a9ff", b50: "#4589ff", b60: "#0f62fe", b70: "#0043ce", b90: "#001d6c",
  o40: "#ff832b", o60: "#ba4e00", r50: "#fa4d56", r60: "#da1e28", gr40: "#42be65", gr60: "#198038", gr10: "#defbe6", y30: "#f1c21b", y60: "#8e6a00",
};

const gated = [];
const notGated = [];
const add = (list, name, fg, bg, kind) => list.push({ name, fg, bg, kind });
const marks = (list, prefix, mark, kind, surfaces) => surfaces.forEach(([sName, sHex]) => add(list, `${prefix} · ${mark.name} on ${sName}`, mark.hex, sHex, kind));

// ---- Zone C: the shell and dark panels (invariant) --------------------------------
const shellSurfaces = [["shell rest g100", P.g100], ["shell hover #333333", P.hoverG90], ["shell pressed g80", P.g80]];
const panelSurfaces = [["panel g100", P.g100], ["panel layer g90", P.g90], ["panel row hover #333333", P.hoverG90], ["panel pressed g80", P.g80]];
for (const m of [{ name: "text gray-10", hex: P.g10 }, { name: "secondary gray-30", hex: P.g30 }, { name: "helper gray-40", hex: P.g40 }]) marks(gated, "shell", m, "text", shellSurfaces);
for (const m of [{ name: "mode Published ■ gray-10", hex: P.g10 }, { name: "mode Draft ◇ orange-40", hex: P.o40 }, { name: "mode Not published □ gray-40", hex: P.g40 }, { name: "mode Error ⊗ red-50", hex: P.r50 }, { name: "focus white", hex: P.white }]) marks(gated, "shell", m, "graphic", shellSurfaces);
add(gated, "shell · current bar blue-50 on shell g100", P.b50, P.g100, "graphic");
add(gated, "shell · nav link gray-30 on shell g100", P.g30, P.g100, "text");
add(gated, "shell · nav link gray-30 on shell hover", P.g30, P.hoverG90, "text");
add(gated, "shell · nav link gray-10 on shell pressed g80", P.g10, P.g80, "text");
add(gated, "shell · tooltip text gray-10 on tooltip gray-80", P.g10, P.g80, "text");
for (const m of [{ name: "text gray-10", hex: P.g10 }, { name: "secondary gray-30", hex: P.g30 }, { name: "helper gray-40", hex: P.g40 }, { name: "ghost blue-40", hex: P.b40 }]) marks(gated, "panel", m, "text", panelSurfaces);
add(gated, "panel · ghost hover blue-30 on row hover #333333", P.b30, P.hoverG90, "text");
add(gated, "panel · ghost pressed blue-30 on g80", P.b30, P.g80, "text");
add(gated, "panel · tag text gray-10 on tag gray-80", P.g10, P.g80, "text");
add(gated, "panel · switch selected text gray-100 on gray-10", P.g100, P.g10, "text");
add(gated, "panel · switch selected fill gray-10 vs panel g100", P.g10, P.g100, "graphic");
add(gated, "panel · switch unselected text gray-10 on hover #333333", P.g10, P.hoverG90, "text");
for (const m of [{ name: "error mark red-50", hex: P.r50 }, { name: "radio ring gray-10", hex: P.g10 }, { name: "focus white", hex: P.white }]) marks(gated, "panel", m, "graphic", panelSurfaces);
add(notGated, "shell rule gray-80 on g100 (divider; utility outline)", P.g80, P.g100, "graphic");
add(notGated, "shell skeleton element gray-80 on skeleton bg #292929", P.g80, P.hoverG100, "graphic");
add(notGated, "panel row hover #333333 vs panel g100 (hover step)", P.hoverG90, P.g100, "graphic");
add(notGated, "panel tag fill gray-80 vs g100 (text carries it)", P.g80, P.g100, "graphic");
add(notGated, "switch unselected edge gray-80 vs g100 (selected fill + text carry identity)", P.g80, P.g100, "graphic");

// ---- Light theme surfaces ---------------------------------------------------------
const L = { bg: ["white", P.white], l1: ["layer-01 #f4f4f4", P.g10], hover: ["layer-hover-01 #e8e8e8", P.hoverWhite], sel: ["layer-selected #e0e0e0", P.g20], hi: ["highlight #d0e2ff", P.b20], ok: ["success-subtle #defbe6", P.gr10] };
const lightRows = [L.bg, L.l1, L.hover, L.sel];
for (const m of [{ name: "text-primary gray-100", hex: P.g100 }, { name: "text-secondary gray-70", hex: P.g70 }]) marks(gated, "light", m, "text", [...lightRows, L.hi]);
for (const m of [{ name: "seat stroke gray-70", hex: P.g70 }, { name: "seat fill gray-100", hex: P.g100 }, { name: "checkbox gray-100", hex: P.g100 }, { name: "radio ring gray-100", hex: P.g100 }]) marks(gated, "light", m, "graphic", lightRows);
marks(gated, "light", { name: "draft mark orange-60", hex: P.o60 }, "graphic", [L.bg, L.l1, L.hover, L.hi]);          // pill badge on rest / hover / search fills
marks(gated, "light", { name: "search mark blue-70", hex: P.b70 }, "graphic", [L.hi, L.bg, L.l1]);
marks(gated, "light", { name: "current bar blue-60", hex: P.b60 }, "graphic", [L.sel, L.bg]);
marks(gated, "light", { name: "success mark green-60 (target edge, toggle on)", hex: P.gr60 }, "graphic", [L.bg, L.l1, L.hover, L.ok]);
marks(gated, "light", { name: "error mark red-60", hex: P.r60 }, "graphic", [L.bg, L.l1, L.hover]);
marks(gated, "light", { name: "warning mark yellow-60", hex: P.y60 }, "graphic", [L.bg, L.l1, L.hover]);
marks(gated, "light", { name: "AI label text blue-60", hex: P.b60 }, "text", [L.bg, L.l1]);
add(gated, "light · AI label hover text blue-70 on layer-hover-01", P.b70, P.hoverWhite, "text");
add(gated, "light · AI border start blue-60 on field #f4f4f4", P.b60, P.g10, "graphic");
add(gated, "light · helper-on-row gray-70 on layer-hover-01", P.g70, P.hoverWhite, "text");
add(gated, "light · quiet pill text gray-70 on layer-01 / hover", P.g70, P.hoverWhite, "text");
add(gated, "light · text-on-color white on primary blue-60", P.white, P.b60, "text");
add(notGated, "light · AI border end blue-40 on white (gradient's low stop; the label carries meaning)", P.b40, P.white, "graphic");
add(notGated, "light · left panel rule gray-30 vs layer-01 (divider)", P.g30, P.g10, "graphic");
add(notGated, "light · quiet pill edge gray-30 on layer-01 (quiet is the intent)", P.g30, P.g10, "graphic");

// ---- Dark theme surfaces ----------------------------------------------------------
const D = { bg: ["background #161616", P.g100], l1: ["layer-01 #262626", P.g90], hover: ["layer-hover-01 #333333", P.hoverG90], sel: ["layer-selected #393939", P.g80], fill2: ["layer-02 / pill fill #393939", P.g80], hover2: ["layer-hover-02 #474747", P.hoverG80], hi: ["highlight #001d6c", P.b90] };
const darkRows = [D.bg, D.l1, D.hover, D.sel, D.hover2];
for (const m of [{ name: "text-primary gray-10", hex: P.g10 }, { name: "text-secondary gray-30", hex: P.g30 }]) marks(gated, "dark", m, "text", [...darkRows, D.hi]);
for (const m of [{ name: "seat stroke gray-30", hex: P.g30 }, { name: "seat fill gray-10", hex: P.g10 }, { name: "radio ring gray-10", hex: P.g10 }]) marks(gated, "dark", m, "graphic", darkRows);
marks(gated, "dark", { name: "draft mark orange-40", hex: P.o40 }, "graphic", [D.bg, D.fill2, D.hover2, D.hi]);
marks(gated, "dark", { name: "search mark blue-50", hex: P.b50 }, "graphic", [D.hi, D.bg, D.fill2]);
marks(gated, "dark", { name: "current bar blue-50", hex: P.b50 }, "graphic", [D.sel, D.bg]);
marks(gated, "dark", { name: "success mark green-40 (target edge, toggle on)", hex: P.gr40 }, "graphic", [D.bg, D.l1, D.hover, D.fill2]);
marks(gated, "dark", { name: "error mark red-50", hex: P.r50 }, "graphic", [D.bg, D.l1, D.hover]);
marks(gated, "dark", { name: "warning mark yellow-30", hex: P.y30 }, "graphic", [D.bg, D.l1, D.hover]);
marks(gated, "dark", { name: "AI label text blue-40", hex: P.b40 }, "text", [D.bg, D.l1, D.hover]);
add(gated, "dark · AI border start blue-50 on field #262626", P.b50, P.g90, "graphic");
add(gated, "dark · text-on-color white on primary blue-60", P.white, P.b60, "text");
add(notGated, "dark · AI border end blue-40 on layer-01 #262626 (gradient's low stop)", P.b40, P.g90, "graphic");

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
fs.writeFileSync(path.join(dir, "product-pairs.json"), JSON.stringify(gated, null, 1) + "\n");
fs.writeFileSync(path.join(dir, "surface-pairs-not-gated.json"), JSON.stringify(notGated, null, 1) + "\n");
console.log(`product-pairs.json: ${gated.length} pairs · surface-pairs-not-gated.json: ${notGated.length} pairs`);
