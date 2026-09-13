import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, screen, fireEvent, cleanup, act, setViewportWidth } from "./helpers/renderComponent.mjs";

let Provider, Control;
before(async () => {
  const loaded = await loadComponent("@/components/admin-management/ManagementDensity");
  Provider = loaded.ManagementDensityProvider;
  Control = loaded.ManagementDensityControl;
});
afterEach(() => { cleanup(); setViewportWidth(1280); });

test("Management density restores the preference and changes only display state", async () => {
  const { container } = await renderElement(React.createElement(Provider, { initialDensity: "compact" }, React.createElement(Control)));
  assert.ok(screen.getByRole("radio", { name: "Compact" }).checked);
  assert.equal(container.querySelector("[data-density]").dataset.density, "compact");
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Normal" })));
  assert.ok(screen.getByRole("radio", { name: "Normal" }).checked);
  assert.equal(container.querySelector("[data-density]").dataset.density, "normal");
});

test("narrow Management uses Normal while retaining the saved Compact preference", async () => {
  setViewportWidth(390);
  const { container } = await renderElement(React.createElement(Provider, { initialDensity: "compact" }, React.createElement(Control)));
  assert.ok(screen.getByRole("radio", { name: "Normal" }).checked);
  assert.ok(screen.getByRole("radio", { name: "Compact" }).disabled);
  assert.equal(container.querySelector("[data-density]").dataset.density, "compact");
  assert.ok(screen.getByText(/larger screens with a mouse or trackpad/));
});

test("denied preference storage does not prevent switching density", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, "cookie");
  Object.defineProperty(document, "cookie", { configurable: true, set() { throw new Error("blocked"); } });
  try {
    await renderElement(React.createElement(Provider, null, React.createElement(Control)));
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Compact" })));
    assert.ok(screen.getByRole("radio", { name: "Compact" }).checked);
  } finally {
    if (descriptor) Object.defineProperty(document, "cookie", descriptor);
    else delete document.cookie;
  }
});
