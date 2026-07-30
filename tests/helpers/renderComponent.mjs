// Component-test harness. React components can't be imported directly by
// `node --test` (JSX/TSX, `@/` aliases, and server-only boundaries like
// `@/app/actions` and `next/*`), so this:
//   1. installs a jsdom DOM as the global environment,
//   2. bundles a component with esbuild — resolving `@/` via tsconfig and
//      swapping the server/framework boundaries for controllable test doubles,
//   3. renders it with @testing-library/react.
//
// Test doubles read from globalThis.__ct (set per test via configureContext),
// so a test can drive router.push, the Supabase auth client, and server actions
// and assert on how the component called them.

import { JSDOM } from "jsdom";
import * as esbuild from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CACHE_DIR = `${ROOT}node_modules/.cache/ct`;

// --- jsdom as the global environment (must run before RTL is imported) -------
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
function setGlobal(key, value) {
  try {
    globalThis[key] = value;
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
}
setGlobal("window", dom.window);
setGlobal("document", dom.window.document);
for (const key of [
  "HTMLElement",
  "HTMLInputElement",
  "HTMLFormElement",
  "HTMLButtonElement",
  "Node",
  "Element",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "DOMParser"
]) {
  if (dom.window[key] !== undefined) setGlobal(key, dom.window[key]);
}
setGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const rtl = await import("@testing-library/react");
const React = (await import("react")).default;
const { act } = await import("react");

export const { screen, fireEvent, within, waitFor, cleanup } = rtl;
export { act, React };

// Point the component's URL at a path (drives useSearchParams / window.location).
export function setUrl(path) {
  dom.reconfigure({ url: `http://localhost${path}` });
}

// Set the test doubles the mocked modules delegate to. Called from beforeEach.
export function configureContext({ router, supabase, actions } = {}) {
  globalThis.__ct = {
    router: { push() {}, replace() {}, refresh() {}, back() {}, prefetch() {}, ...router },
    supabase: supabase ?? { auth: {} },
    actions: actions ?? {}
  };
}

// Server/framework boundaries replaced at bundle time. All delegate to
// globalThis.__ct so tests stay in control. `@/app/actions` needs static export
// names, so the actions used by the tested components are listed explicitly.
const ACTION_EXPORTS = [
  "updateSeatAction",
  "createSeatAction",
  "deleteSeatAction",
  "swapSeatAssignmentsAction",
  "publishSeatMapAction",
  "restoreDraftSnapshotAction",
  "getPublishHistoryAction",
  "askPlannerAction",
  "createEmployeeAction",
  "updateEmployeeAction",
  "deleteEmployeeAction"
];

const STANDARD_MOCKS = {
  "next/navigation": `
    export const useRouter = () => globalThis.__ct.router;
    export const usePathname = () => "/";
    export const useSearchParams = () => new URLSearchParams(window.location.search);
    export const redirect = () => {};
  `,
  "next/link": `
    import React from "react";
    export default function Link({ href, children, ...rest }) {
      return React.createElement("a", { href, ...rest }, children);
    }
  `,
  "next/image": `
    import React from "react";
    export default function Image({ src, alt = "", width, height, ...rest }) {
      const resolved = typeof src === "object" && src ? (src.src ?? "") : src;
      return React.createElement("img", { src: resolved, alt });
    }
  `,
  "@/lib/supabase/client": `export const createClient = () => globalThis.__ct.supabase;`,
  "@/app/actions": ACTION_EXPORTS.map(
    name => `export const ${name} = (...args) => (globalThis.__ct.actions[${JSON.stringify(name)}] ?? (async () => ({})))(...args);`
  ).join("\n")
};

function mockPlugin(mocks) {
  const names = Object.keys(mocks);
  const filter = new RegExp(`^(${names.map(n => n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})$`);
  return {
    name: "ct-mocks",
    setup(build) {
      build.onResolve({ filter }, args => ({ path: args.path, namespace: "ct-mock" }));
      build.onLoad({ filter: /.*/, namespace: "ct-mock" }, args => ({ loader: "js", contents: mocks[args.path] }));
    }
  };
}

let bundleCount = 0;
// Bundle `entry` (an `@/...` module path) and import it, returning its exports.
// extraMocks lets a test stub additional modules (e.g. a heavy child).
export async function loadComponent(entry, { extraMocks = {} } = {}) {
  const mocks = { ...STANDARD_MOCKS, ...extraMocks };
  const result = await esbuild.build({
    stdin: { contents: `export * from "${entry}";`, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    tsconfig: `${ROOT}tsconfig.json`,
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [mockPlugin(mocks)],
    write: false,
    logLevel: "silent"
  });
  await mkdir(CACHE_DIR, { recursive: true });
  bundleCount += 1;
  const outPath = `${CACHE_DIR}/${entry.replace(/[^a-zA-Z0-9]+/g, "_")}_${bundleCount}.mjs`;
  await writeFile(outPath, result.outputFiles[0].text, "utf8");
  return import(pathToFileURL(outPath).href);
}

// Render a React element (already created) into the jsdom document, flushing
// effects inside act(). Returns the RTL render result.
export async function renderElement(element) {
  let utils;
  await act(async () => {
    utils = rtl.render(element);
  });
  return utils;
}
