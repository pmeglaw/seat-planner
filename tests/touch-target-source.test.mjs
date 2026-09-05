import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// Touch-target guard (PR-2, F-SP-4 — reviewer rulings 2026-08-26).
//
// The binding minimum is 44×44 CSS px for every interactive element off the
// map canvas (skill v1.2.0: the WCAG touch minimum beats the height ladder).
// The mechanism is HIT EXPANSION, not resize: visual size stays put and the
// hit area grows via the house pattern
//   relative + after:absolute + after:-inset-*
// (reference implementations: AccountMenu.tsx 26px + -inset-[9px] = 44,
// DataUtilitiesPanel.tsx 32px + -inset-1.5 = 44).
//
// This scan enforces the ARITHMETIC, not mere presence of an after:-inset:
// Tailwind unit = 4px per step, so reach = size + 2 × inset (per axis, with
// per-side after:-left/right/top/bottom overrides). A bare presence check
// would have passed the pre-PR-2 chromeIconBtn (28 + 2×6 = 40 — exactly the
// 4px shortfall the audit found).
//
// Scope and structural rules:
//   - Scans className string literals in app/** and components/** (.tsx).
//     app/concepts/** is prototype-only and skipped; SeatMarker.tsx is the
//     map canvas, exempt by standing ruling (NOTES.md).
//   - A literal is treated as interactive when it carries hover:/
//     focus-visible:/cursor-pointer styling. Literals without an explicit
//     h-/w-/size-/min-h-/min-w- cap are content-sized and cannot be verified
//     statically — the pinned-expansion block below holds those sites.
//   - <input>/<select> cannot host ::after; their expansion lives on the
//     wrapping <label> (native label forwarding). LABEL_CARRIED names those
//     input literals; each has a matching pin asserting the label's class.
//   - NO-OVERLAP RULE (reviewer, 2026-08-26): expansion on any side is capped
//     at half the gap to the nearest sibling interactive target. Where the
//     cap leaves an axis under 44 the site goes in the LEDGER as
//     "adjacency-capped" with the measured reach. The only other ledger
//     reason is "not-pointer-control". Respacing clusters is a visual change
//     deferred to a later ruling.
//   - Adjacency itself (no expansion crosses a sibling's visual box) is
//     verified in the live visual pass, not here — outline hit areas with a
//     temporary after:bg-red-500/20 when re-checking.
//
// Zero-expansion adjacency captures (no explicit size, so the sweep cannot
// see them — recorded here so the reasons survive):
//   - Reception fallback rows (zero-gap stack) and recent rows (1px hairline
//     gap): vertical cap 0 — reach ≈32 / ≈42, WCAG 2.5.8 satisfied.
//   - Floor/kebab menu items (zero-gap stack, ≈33–37): no vertical expansion;
//     Carbon's own menu row is 32.
//   - Management sort-header buttons: expanded only within the header row's
//     box (after:-inset-y-2, reach ≈33) — never into data row 1.
//   - Login inline text buttons: capped by the field above / row below.
//   - MapZoomControl: the stacks are zero-gap, so expansion is outward faces
//     only — 44 on the cross axis, 28–38 along the stack. The size and the
//     expansion live in different template chunks, so the sweep cannot join
//     them; the pins below hold the per-face classes.

const LEDGER = [];

// <input>/<select> literals whose 44px reach is delivered by the wrapping
// <label> (::after cannot render on replaced form controls). Each entry has a
// matching pin below asserting the label's expansion class.
const LABEL_CARRIED = [
  // (The LoginForm remember-me checkbox is the same shape — 15px <input>,
  // expansion on the wrapping label — but its focus classes live in a separate
  // cx() chunk, so the sweep never joins them; its label pin below holds it.)
];

// Regression pins: sites whose expansion the sweep cannot derive (content
// sized, template-composed, or label-carried). Each entry: file → substrings
// that must ALL be present. Removing an expansion removes its substring and
// fails here.
const PINS = {
  "components/ui/Button.tsx": ["after:absolute after:-inset-y-1"],
  "components/seat-map/SeatMap.tsx": [
    "after:absolute after:-inset-y-1.5",
    "after:absolute after:-inset-y-1.5"
  ],
  // Phase 4 PR 3b: the inspector's icon buttons are the asset's 40px
  // `.cds-btn--icon` with the `.cds-touch-target` pseudo (44); the move-
  // conflict dialog's close keeps its Tailwind expansion.
  "components/seat-map/SeatInspector.tsx": [
    "cds-btn cds-btn--icon cds-btn--md cds-touch-target",
    "cds-btn cds-btn--icon cds-touch-target",
    "after:absolute after:-inset-1.5"
  ],
  "components/seat-map/SeatMapDialogs.tsx": ["after:absolute after:-inset-1.5"],
  // Seat markers: the canvas stays exempt from the sweep (SKIP_FILES). Phase 4
  // PR 3b: every marker — the name pill and the empty-seat footprint — carries
  // the asset's `.cds-touch-target` pseudo (44px, deviation 7; the rule is
  // `.sp-pill.cds-touch-target::after, .sp-seat-footprint.cds-touch-target::after`
  // in sp-components.css). The pitch-gated floor retired with the code pills.
  "components/seat-map/SeatMarker.tsx": [
    "sp-pill cds-touch-target",
    "sp-seat-footprint cds-touch-target"
  ],
  "components/admin-management/AdminManagementPanel.tsx": [
    "after:absolute after:-inset-2",
    "after:absolute after:-inset-y-1.5 after:-left-1 after:-right-2",
    "after:absolute after:-inset-1.5",
    "after:absolute after:-inset-y-3",
    "after:absolute after:-inset-y-2"
  ],
  "components/auth/LoginForm.tsx": [
    "after:absolute after:-inset-1.5",
    // remember-me label (checkbox is LABEL_CARRIED)
    "after:absolute after:-inset-y-2",
    // forgot-password, capped by the password field above / remember row below
    "after:absolute after:-top-1 after:-bottom-2"
  ],
  // PR 3b: the drawer's close is the asset's 40px icon button with the
  // touch-target pseudo; prompts and follow-ups are 40px ghosts in the
  // zero-gap `.sp-prompt-list` (PHASE3DS §1.18 — stacked, outward faces only).
  "components/seat-map/AskPlannerDrawer.tsx": [
    "cds-btn cds-btn--icon cds-btn--md cds-touch-target",
    "sp-prompt-list"
  ],
  "app/(shell)/admin/page.tsx": ["after:absolute after:-inset-y-1"]
};

const ROOTS = ["app", "components"];
const SKIP_DIRS = new Set(["concepts", "fonts", "node_modules"]);
const SKIP_FILES = new Set(["SeatMarker.tsx"]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function collectFiles(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith(".tsx") && !SKIP_FILES.has(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function relPath(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

// Pull every string literal that could be a class list: double-quoted strings
// plus template-literal text with ${...} interpolations stripped.
function classLiterals(source) {
  const out = [];
  const dq = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = dq.exec(source))) out.push(m[1]);
  const tpl = /`((?:[^`\\]|\\.)*)`/g;
  while ((m = tpl.exec(source))) out.push(m[1].replace(/\$\{[^}]*\}/g, " "));
  return out;
}

const INTERACTIVE_RE = /(?<![\w-])(?:hover|focus-visible):|cursor-pointer/;

function px(unit, arb) {
  return arb !== undefined ? Number(arb) : Number(unit) * 4;
}

// Smallest explicit cap per axis, in px; null = content-sized on that axis.
function explicitSize(s) {
  let w = null;
  let h = null;
  const take = (curr, val) => (curr === null ? val : Math.min(curr, val));
  const re = /(?<![\w-])(h|w|size|min-h|min-w)-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g;
  let m;
  while ((m = re.exec(s))) {
    const value = px(m[2], m[3]);
    // min-h-0 / min-w-0 are flex shrink fixes, not size caps.
    if (value === 0) continue;
    const kind = m[1];
    if (kind === "h" || kind === "min-h" || kind === "size") h = take(h, value);
    if (kind === "w" || kind === "min-w" || kind === "size") w = take(w, value);
  }
  return { w, h };
}

// Expansion per side from after:-inset utilities (px). Per-side utilities
// override the axis/all-side shorthands when larger.
function expansion(s) {
  const sides = { left: 0, right: 0, top: 0, bottom: 0 };
  const apply = (keys, value) => {
    for (const key of keys) sides[key] = Math.max(sides[key], value);
  };
  const grab = (re, keys) => {
    let m;
    while ((m = re.exec(s))) apply(keys, px(m[1], m[2]));
  };
  grab(/after:-inset-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["left", "right", "top", "bottom"]);
  grab(/after:-inset-x-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["left", "right"]);
  grab(/after:-inset-y-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["top", "bottom"]);
  grab(/after:-left-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["left"]);
  grab(/after:-right-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["right"]);
  grab(/after:-top-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["top"]);
  grab(/after:-bottom-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])(?![\w.[-])/g, ["bottom"]);
  return sides;
}

const MIN = 44;

test("touch targets: every explicitly sized interactive spec reaches 44px per axis, or is ledgered", async () => {
  const files = [];
  for (const root of ROOTS) await collectFiles(path.join(repoRoot, root), files);
  assert.ok(files.length > 40, `expected a real scan, saw ${files.length} files`);

  const violations = [];
  const ledgerHits = new Map();
  const labelCarriedHits = new Map();

  for (const file of files) {
    const rel = relPath(file);
    const source = await readFile(file, "utf8");
    const seen = new Set();
    for (const literal of classLiterals(source)) {
      if (seen.has(literal)) continue;
      seen.add(literal);
      if (!INTERACTIVE_RE.test(literal)) continue;
      const { w, h } = explicitSize(literal);
      if (w === null && h === null) continue;
      const grow = expansion(literal);
      const wReach = w === null ? MIN : w + grow.left + grow.right;
      const hReach = h === null ? MIN : h + grow.top + grow.bottom;
      if (wReach >= MIN && hReach >= MIN) continue;

      const labelEntry = LABEL_CARRIED.find(e => e.file === rel && literal.includes(e.token));
      if (labelEntry) {
        labelCarriedHits.set(labelEntry, (labelCarriedHits.get(labelEntry) ?? 0) + 1);
        continue;
      }
      const ledgerEntry = LEDGER.find(e => e.file === rel && literal.includes(e.token));
      if (ledgerEntry) {
        ledgerHits.set(ledgerEntry, (ledgerHits.get(ledgerEntry) ?? 0) + 1);
        // A ledger ruling caps the reach — it does not license removing the
        // expansion that gets the site to its ruled reach.
        const min = ledgerEntry.minReach ?? {};
        if (min.w !== undefined) {
          assert.ok(wReach >= min.w, `${rel}: ledgered reach shrank below the ruling (${Math.round(wReach)}w < ${min.w}) — "${ledgerEntry.token}"`);
        }
        if (min.h !== undefined) {
          assert.ok(hReach >= min.h, `${rel}: ledgered reach shrank below the ruling (${Math.round(hReach)}h < ${min.h}) — "${ledgerEntry.token}"`);
        }
        continue;
      }
      violations.push(
        `${rel}: reach ${Math.round(wReach)}×${Math.round(hReach)} < ${MIN} — "${literal.slice(0, 110)}"`
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    `interactive specs under ${MIN}px without sufficient after:-inset expansion (add the house hit-expansion pattern, or a ledger ruling):\n${violations.join("\n")}`
  );

  // Stale-entry detection: an adjacency-capped or label-carried entry that no
  // longer matches anything means the site was fixed or moved — delete the
  // entry so the ledger stays honest. ("not-pointer-control" entries may sit
  // unmatched: they document elements the interactive heuristic never flags.)
  for (const entry of LEDGER) {
    if (entry.reason === "not-pointer-control") continue;
    assert.ok(
      ledgerHits.has(entry),
      `stale ledger entry (nothing matches): ${entry.file} — "${entry.token}"`
    );
  }
  for (const entry of LABEL_CARRIED) {
    assert.ok(
      labelCarriedHits.has(entry),
      `stale LABEL_CARRIED entry (nothing matches): ${entry.file} — "${entry.token}"`
    );
  }
});

test("touch targets: pinned hit-expansion classes stay in place", async () => {
  for (const [rel, needles] of Object.entries(PINS)) {
    const source = await readFile(path.join(repoRoot, ...rel.split("/")), "utf8");
    for (const needle of needles) {
      assert.ok(
        source.includes(needle),
        `${rel}: expected pinned expansion "${needle}" — hit-target regression (see PR-2 / F-SP-4)`
      );
    }
  }
});
