import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup, screen } from "./helpers/renderComponent.mjs";

// Standalone AppTopBar suite (chrome-unification 2026-08-20) — the bar-side
// counterpart of tests/app-rail.test.mjs. AppShell-level wiring (slot
// registration, chrome persistence, account-menu semantics) lives in
// tests/app-shell.test.mjs; these pin the bar's OWN structural guardrails:
// slot order, the corner toggle's rail contract, the skip link topping the
// tab order, and the seamless-corner hairline. Visual styling (colors, type
// sizes, spacing) is deliberately unpinned — it is free to evolve.

let AppTopBar;
before(async () => {
  ({ AppTopBar } = await loadComponent("@/components/ui/AppTopBar"));
});

beforeEach(() => {
  configureContext({ pathname: "/admin" });
});
afterEach(() => cleanup());

// The bar is CONTROLLED (AppShell owns railOpen) — this harness stands in for
// AppShell the same way app-rail.test.mjs's harness does for the rail side.
function Harness({ overrides }) {
  const [open, setOpen] = React.useState(false);
  const railToggleRef = React.useRef(null);
  return React.createElement(AppTopBar, {
    active: "map",
    email: "jane@example.com",
    roleLabel: "Admin",
    skipLink: { href: "#planning-canvas", label: "Skip to seat map" },
    onSlotElement: () => {},
    railOpen: open,
    onToggleRail: () => setOpen(current => !current),
    railToggleRef,
    ...overrides
  });
}

const renderBar = (overrides = {}) => renderElement(React.createElement(Harness, { overrides }));
const bar = () => screen.getByRole("banner");

test("the three slots mount in left → center → right DOM order", async () => {
  await renderBar();
  const slots = ["left", "center", "right"].map(name => bar().querySelector(`[data-topbar-slot="${name}"]`));
  assert.ok(slots.every(Boolean), "all three slot elements must exist");
  assert.ok(
    slots[0].compareDocumentPosition(slots[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    "center must follow left"
  );
  assert.ok(
    slots[1].compareDocumentPosition(slots[2]) & Node.DOCUMENT_POSITION_FOLLOWING,
    "right must follow center"
  );
});

test("the corner toggle carries the rail contract and flips aria-expanded", async () => {
  await renderBar();
  const toggle = screen.getByRole("button", { name: "Expand navigation" });
  assert.equal(toggle.getAttribute("aria-controls"), "app-rail");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  await act(async () => fireEvent.click(toggle));

  const collapsed = screen.getByRole("button", { name: "Collapse navigation" });
  assert.equal(collapsed.getAttribute("aria-expanded"), "true");
});

test("the skip link is the bar's first focusable", async () => {
  await renderBar();
  const first = bar().querySelectorAll("a, button, input, [tabindex]")[0];
  assert.equal(first.getAttribute("href"), "#planning-canvas");
  assert.equal(first.textContent, "Skip to seat map");
});

// Seamless corner (owner ruling 2026-08-14): the bottom hairline must start
// to the RIGHT of the 48px corner cell so no seam ever cuts the upside-down
// L where bar meets rail. The class values are the contract here — left-12
// aligns with the rail column width.
test("the bottom hairline starts clear of the corner cell", async () => {
  await renderBar();
  const hairline = Array.from(bar().querySelectorAll('span[aria-hidden="true"]')).find(span =>
    span.className.includes("h-px")
  );
  assert.ok(hairline, "the bar must render its bottom hairline");
  assert.ok(hairline.className.includes("left-12"), "the hairline must not cut across the corner cell");
});

// Regression pin for the chrome-unification fix: the AccountMenu popover's
// vertical offset must derive from --sp-chrome-height, never a hardcoded pixel
// literal — a bar-height change silently stranded the old top-[34px].
test("the account menu offset derives from the chrome height token", async () => {
  const source = await readFile(fileURLToPath(new URL("../components/ui/AccountMenu.tsx", import.meta.url)), "utf8");
  assert.match(source, /var\(--sp-chrome-height\)/);
  assert.doesNotMatch(source, /top-\[34px\]/);
});
