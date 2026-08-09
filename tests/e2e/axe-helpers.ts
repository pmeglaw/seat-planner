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
 * Wait until an element's computed paint holds still across two samples.
 * Buttons that MOUNT disabled and then flip enabled (the Settings review
 * dialogs open inside a useTransition, so their footers render disabled first)
 * animate their palette for ~150ms via the Button primitive's
 * transition-colors. The disabled attribute drops instantly — toBeEnabled()
 * resolves — but the paint lags, and axe sampling mid-animation reads blend
 * colors that can dip below AA even though both endpoints pass (observed:
 * #f3f3f2 on #d44c1a, 3.9:1, halfway between the disabled palette and the
 * 4.71:1 primary). Await this on one footer button before scanning such a
 * dialog; every button in it animates in the same window.
 *
 * `opacity` is sampled alongside the colors, and it is not decoration: axe
 * computes contrast from the EFFECTIVE blended color, so a panel fading in
 * (sp-panel-in animates opacity 0 → 1 over 200ms) shifts what axe measures
 * while `color` and `backgroundColor` never change. Sampling colors alone
 * therefore resolves after one 120ms tick — still mid-fade — and reports a
 * transient violation against nodes that pass at rest. That is what made
 * SeatMap's swap/move mode card flag its own label and "Esc exits" chip on
 * #348, both of which measure 4.71:1 and 5.29:1 settled.
 */
export async function waitForColorSettle(locator: ReturnType<Page["locator"]>) {
  await locator.evaluate(
    element =>
      new Promise<void>(resolve => {
        let previous = "";
        const check = () => {
          const style = getComputedStyle(element);
          const current = `${style.backgroundColor}/${style.color}/${style.opacity}`;
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
