import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

// PR-3 guard (AUDIT-2 F-DK-1): the auth surfaces — login, the auth callback
// pages, and the update-password form — speak the semantic token vocabulary
// in BOTH themes. UpdatePasswordForm was the last pre-token surface: a
// hardcoded white card (`bg-white rounded-2xl shadow-soft`) whose token text
// flipped light-on-white in dark, raw-hex greige hairlines (`#D8D0C5`, one of
// the four R5 candidates — deleted here, not re-tokenized; R5 rules the
// surviving value in the PR-11 brief), and the retired orange focus glow
// (`focus:ring-4 focus:ring-orange-100`). This scan keeps all of that from
// coming back anywhere in the auth scope.
//
// Scope is auth only (components/auth, app/auth, app/login) — the repo-wide
// JSX ink sweep is PR-9b's. app/concepts/ prototypes are not scanned (never
// shipped surfaces).
//
// Mechanics mirror tests/touch-target-source.test.mjs: rules run over the
// files' string literals (double-quoted strings + template chunks), never
// over comments — so a comment may NAME a banned class while explaining a
// ledger entry without tripping the scan.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const SCAN_ROOTS = ["components/auth", "app/auth", "app/login"];

function collectFiles(root) {
  const abs = path.join(repoRoot, root);
  const out = [];
  for (const entry of readdirSync(abs)) {
    const p = path.join(abs, entry);
    if (statSync(p).isDirectory()) {
      out.push(...collectFiles(path.join(root, entry)));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(path.join(root, entry).replaceAll("\\", "/"));
    }
  }
  return out;
}

const files = SCAN_ROOTS.flatMap(collectFiles);

// Every double-quoted string literal plus every template-literal chunk, with
// `${…}` interpolations stripped. Comments never reach the rules.
function stringLiterals(source) {
  const literals = [];
  for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) literals.push(match[1]);
  for (const match of source.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    literals.push(match[1].replace(/\$\{[^}]*\}/g, " "));
  }
  return literals;
}

// ---------------------------------------------------------------------------
// Rules. Each is a regex applied to every string literal; any match not
// covered by the LEDGER below fails the scan.
// ---------------------------------------------------------------------------
const RULES = [
  {
    name: "hardcoded white surface (bg-white)",
    // The old card. Every surface color comes from a --sp-* token so dark
    // resolves; bg-white is exactly the class that made the card unreadable.
    pattern: /(?<![\w-])bg-white(?![\w-])/g
  },
  {
    name: "hardcoded white text (text-white)",
    // Ledgered where it is deliberate: the 1e primary's white label on the
    // theme-constant copper (#B85207 in both themes).
    pattern: /(?<![\w-])text-white(?![\w-])/g
  },
  {
    name: "raw hex in an arbitrary-value utility",
    // border-[#D8D0C5] and friends. Colors come from var(--sp-*); a hex in a
    // class is a value dark mode can never re-theme. (Plain string literals
    // like an svg stroke="#fff" attribute are not utility classes and do not
    // match — the pattern requires a utility prefix before the bracket.)
    pattern: /[a-z][\w-]*-\[[^\]]*#[0-9a-fA-F]{3,8}[^\]]*\]/g
  },
  {
    name: "corner radius (rounded-*)",
    // Carbon: zero radius on boxes. rounded-full stays legal — it draws
    // circular MARKS (the button spinner, the login panel's decorative dots),
    // not box corners.
    pattern: /(?<![\w-])rounded-(?!full(?![\w-]))[\w[\]/.-]+/g
  },
  {
    name: "Tailwind palette color utility",
    // ring-orange-100 etc. — palette utilities bypass the token layer.
    pattern:
      /(?<![\w-])(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|caret|accent|divide|shadow)-(?:orange|amber|red|rose|blue|sky|green|emerald|gray|zinc|slate|neutral|stone|yellow|lime|teal|cyan|indigo|violet|purple|fuchsia|pink)-\d+/g
  },
  {
    name: "retired focus glow (focus:ring-4)",
    // The pre-token 4px orange halo. The sanctioned ring is focusRingClass /
    // focus-visible:ring-2 in --sp-focus — `focus-visible:ring-4` from the
    // design-system focusRingClass does NOT match this (different prefix).
    pattern: /(?<![\w-])focus:ring-4(?![\w-])/g
  },
  {
    name: "legacy brand alias utility",
    // focus:border-brand — the pre-token accent alias. Accent comes from
    // --sp-button-primary / --sp-brand tokens.
    pattern: /(?<![\w-])(?:border|bg|text|ring)-brand(?![\w-])/g
  },
  {
    name: "non-token shadow",
    // shadow-soft and named shadows bypass the --sp-shadow-* layer. Ledgered:
    // the login panel's decorative dot halo (arbitrary rgba of the
    // theme-constant copper on an aria-hidden illustration).
    pattern: /(?<![\w-])shadow-(?!\[color:var\()[\w[\]/.,%()_-]+/g
  }
];

// Deliberate, reviewed exceptions. `count` pins how many matches the entry
// covers — a new occurrence of the same token still fails, and an entry whose
// token disappears goes stale and fails the ledger-freshness check.
const LEDGER = [
  {
    file: "components/auth/LoginForm.tsx",
    rule: "hardcoded white text (text-white)",
    token: "text-white",
    count: 1,
    reason: "1e primary: white label on the theme-constant copper #B85207 (both themes)"
  },
  {
    file: "components/auth/UpdatePasswordForm.tsx",
    rule: "hardcoded white text (text-white)",
    token: "text-white",
    count: 1,
    reason: "same 1e primary recipe as LoginForm (PR-3 reuse, not reinvention)"
  },
  {
    file: "app/login/page.tsx",
    rule: "hardcoded white text (text-white)",
    token: "text-white",
    count: 1,
    reason: "already-signed-in Continue CTA — the same 1e primary recipe"
  },
  {
    file: "app/login/page.tsx",
    rule: "non-token shadow",
    token: "shadow-[0_0_0_3px_rgba(184,82,7,0.35)]",
    count: 1,
    reason: "decorative pulse halo on the aria-hidden brand-panel dot; rgba of the theme-constant copper"
  }
];

test("auth surfaces carry no pre-token styling (F-DK-1)", () => {
  const failures = [];

  for (const file of files) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    const literals = stringLiterals(source);

    for (const rule of RULES) {
      const matches = [];
      for (const literal of literals) {
        for (const match of literal.matchAll(rule.pattern)) matches.push(match[0]);
      }
      if (matches.length === 0) continue;

      const entries = LEDGER.filter(entry => entry.file === file && entry.rule === rule.name);
      let unledgered = [...matches];
      for (const entry of entries) {
        let covered = 0;
        unledgered = unledgered.filter(m => {
          if (covered < entry.count && (m === entry.token || m.includes(entry.token) || entry.token.includes(m))) {
            covered += 1;
            return false;
          }
          return true;
        });
      }
      if (unledgered.length > 0) {
        failures.push(`${file}: ${rule.name} → ${unledgered.join(", ")}`);
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Pre-token styling in the auth scope:\n${failures.join("\n")}\n` +
      "Use --sp-* tokens (the LoginForm recipe is canonical); a deliberate exception needs a LEDGER entry with a reason."
  );
});

test("the exception ledger is not stale", () => {
  for (const entry of LEDGER) {
    const source = readFileSync(path.join(repoRoot, entry.file), "utf8");
    const literals = stringLiterals(source).join("\n");
    assert.ok(
      literals.includes(entry.token),
      `Stale ledger entry: ${entry.file} no longer contains "${entry.token}" — delete the entry (${entry.reason})`
    );
  }
});

// ---------------------------------------------------------------------------
// Reverse-direction dark check: every --sp-* token the auth files reference
// resolves in dark. Zone-scoped tokens must appear in BOTH .login-theme
// blocks (light + dark) unless deliberately theme-constant; tokens outside
// the zone must be defined in the global :root and re-declared in a
// data-theme="dark" block. zone-wash covers dark→chrome; this covers "the
// tokens this surface uses exist in dark at all".
// ---------------------------------------------------------------------------

// Ruled theme-constant in app/globals.css §3.8 (comments there explain each):
// the 1e copper CTA ladder never re-themes, and the danger MARK keeps Carbon
// red 60 in both themes (only danger TEXT lightens).
const THEME_CONSTANT = new Set(["--sp-button-primary", "--sp-button-primary-hover", "--sp-status-danger-mark"]);

function cssBlocks(css) {
  // Naive but sufficient: top-level `selector { body }` pairs. Comments are
  // stripped FIRST — the prose above a block otherwise rides along in the
  // selector capture and misclassifies it (measured: the .login-theme block's
  // preceding comment mentions data-theme). Nested structures (@media) are
  // treated as flat blocks, which is fine for a token-presence check.
  const blocks = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // The capture runs from the previous closing brace, so take only the
    // final line — the actual selector.
    const selector = match[1].trim().split("\n").pop().trim();
    blocks.push({ selector, body: match[2] });
  }
  return blocks;
}

test("every --sp token the auth surfaces reference resolves in dark", () => {
  const css = readFileSync(path.join(repoRoot, "app/globals.css"), "utf8");
  const blocks = cssBlocks(css);

  const definedIn = predicate =>
    new Set(
      blocks
        .filter(predicate)
        .flatMap(block => [...block.body.matchAll(/(--sp-[\w-]+)\s*:/g)].map(match => match[1]))
    );

  const loginLight = definedIn(b => b.selector.includes(".login-theme") && !b.selector.includes("data-theme"));
  const loginDark = definedIn(b => b.selector.includes(".login-theme") && b.selector.includes('data-theme="dark"'));
  const globalLight = definedIn(b => !b.selector.includes("data-theme") && !b.selector.includes(".login-theme"));
  const globalDark = definedIn(b => b.selector.includes('data-theme="dark"') && !b.selector.includes(".login-theme"));

  const referenced = new Set();
  for (const file of files) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    for (const literal of stringLiterals(source)) {
      for (const match of literal.matchAll(/var\((--sp-[\w-]+)\)/g)) referenced.add(match[1]);
    }
  }
  assert.ok(referenced.size > 0, "expected the auth surfaces to reference --sp tokens");

  const problems = [];
  for (const token of referenced) {
    if (THEME_CONSTANT.has(token)) continue;
    if (loginLight.has(token)) {
      // Zone-scoped: the dark zone block must re-theme it.
      if (!loginDark.has(token)) problems.push(`${token} is login-zone scoped but missing from the dark .login-theme block`);
    } else if (globalLight.has(token)) {
      if (!globalDark.has(token)) problems.push(`${token} has no data-theme="dark" definition`);
    } else {
      problems.push(`${token} is not defined in app/globals.css at all`);
    }
  }

  assert.deepEqual(problems, [], `Auth tokens that do not resolve in dark:\n${problems.join("\n")}`);
});
