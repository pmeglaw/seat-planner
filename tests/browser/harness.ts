import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { HARNESS_HTML } from "./build-harness";

export const HARNESS_URL = pathToFileURL(HARNESS_HTML).href;

type MountOptions = {
  // Result each server action / router call returns, keyed by "action:<name>",
  // "router.push", etc. A function receives the call args.
  responses?: Record<string, unknown | ((args: unknown[]) => unknown)>;
};

export type CtCall = { name: string; args: unknown[] };

// Load the harness, wire the Node<->browser call bridge, and mount the real
// SeatMap with `props`. Returns the recorded call log (mutated as the component
// calls back). Markers/controls are driven with dispatchEvent because the
// harness ships no Tailwind CSS, so elements aren't laid out for hit-testing —
// the point here is SeatMap's real composed behavior, not its pixel layout.
export async function mountSeatMap(page: Page, props: unknown, { responses = {} }: MountOptions = {}) {
  const calls: CtCall[] = [];
  await page.exposeFunction("__ctCall", (name: string, args: unknown[]) => {
    calls.push({ name, args });
    const result = responses[name];
    return typeof result === "function" ? (result as (a: unknown[]) => unknown)(args) : (result ?? null);
  });
  await page.goto(HARNESS_URL);
  await page.evaluate(p => (window as unknown as { __mountSeatMap: (p: unknown) => void }).__mountSeatMap(p), props);
  // Let the first layout/measure pass settle.
  await page.waitForTimeout(250);
  return { calls };
}
