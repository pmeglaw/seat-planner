import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
/**
 * Waits until an element's computed background and text colors remain unchanged across two consecutive samples.
 */
export async function waitForColorSettle(locator: ReturnType<Page["locator"]>) {
  await locator.evaluate(
    element =>
      new Promise<void>(resolve => {
        let previous = "";
        const check = () => {
          const style = getComputedStyle(element);
          const current = `${style.backgroundColor}/${style.color}`;
          if (current === previous) return resolve();
          previous = current;
          setTimeout(check, 120);
        };
        check();
      })
  );
}

/**
 * Run the standard WCAG A/AA scan against the page's CURRENT state and assert
 * zero violations. Callers are responsible for settling the UI first — axe
 * scans whatever is on screen, so a scan fired mid-transition or mid-animation
 * reports that transient paint, not the surface under test.
 */
export async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_A_AA_TAGS).analyze();
  expect(formatAxeViolations(violations)).toEqual([]);
}

/**
 * Formats Axe violations into readable diagnostic messages.
 *
 * @param violations - The Axe violations to format
 * @returns One formatted message for each violation
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
