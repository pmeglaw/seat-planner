import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, cleanup, setViewportWidth } from "./helpers/renderComponent.mjs";

let Provider, useRowHeight;
before(async () => {
  const loaded = await loadComponent("@/components/admin-management/ManagementDensity");
  Provider = loaded.ManagementDensityProvider;
  useRowHeight = loaded.useManagementRowHeight;
});
afterEach(() => { cleanup(); setViewportWidth(1280); });

function RowHeight() {
  return React.createElement("output", null, useRowHeight());
}

test("Management uses compact geometry without reading or writing preferences", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(document, "cookie");
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get() { throw new Error("Unexpected preference read"); },
    set() { throw new Error("Unexpected preference write"); }
  });
  try {
    const { container } = await renderElement(React.createElement(Provider, null, React.createElement(RowHeight)));
    assert.equal(container.querySelector("output").textContent, "32");
    assert.ok(!container.querySelector('input[type="radio"]'));
  } finally {
    if (descriptor) Object.defineProperty(document, "cookie", descriptor);
    else delete document.cookie;
  }
});

test("narrow screens start with accessible virtual row estimates", async () => {
  setViewportWidth(390);
  const { container } = await renderElement(React.createElement(Provider, null, React.createElement(RowHeight)));
  assert.equal(container.querySelector("output").textContent, "48");
});
