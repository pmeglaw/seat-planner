import type { Result } from "axe-core";

/**
 * WCAG 2.0/2.1 level A and AA — the conformance target the repo's contrast
 * notes in app/globals.css already assume. Best-practice rules are deliberately
 * excluded: they are opinions (e.g. "region", which flags any content outside a
 * landmark) and would make the suite fail on style choices rather than on
 * accessibility defects.
 */
export const WCAG_A_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Collapse axe violations into readable one-line strings.
 *
 * Asserting on this instead of `violations.length === 0` is what makes a
 * failure diagnosable: Playwright prints the expected/received arrays, so the
 * report names the rule and the offending selector directly rather than saying
 * "expected 3 to equal 0" and leaving the reader to open a trace.
 */
export function formatAxeViolations(violations: Result[]): string[] {
  return violations.map(violation => {
    const targets = violation.nodes
      .slice(0, 5)
      .map(node => node.target.join(" "))
      .join(", ");
    const overflow = violation.nodes.length > 5 ? ` (+${violation.nodes.length - 5} more)` : "";
    return `${violation.id} [${violation.impact ?? "unknown"}]: ${violation.help} — ${targets}${overflow}`;
  });
}
