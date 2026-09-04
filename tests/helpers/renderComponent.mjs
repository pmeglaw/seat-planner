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
// pretendToBeVisual gives jsdom a requestAnimationFrame/cancelAnimationFrame
// pair. Without it jsdom defines neither, the copy loop below skips them
// silently, and any component that schedules a frame in an effect dies with
// "window.requestAnimationFrame is not a function" at mount.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
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
  // Select and textarea belong here for the same reason input does: the map
  // surfaces decide whether a key press landed in an editable control with
  // `target instanceof HTMLSelectElement`, and an absent global makes that a
  // ReferenceError thrown inside a jsdom listener — which surfaces as an
  // unrelated-looking test failure rather than as a missing environment API.
  "HTMLSelectElement",
  "HTMLTextAreaElement",
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

// --- APIs jsdom does not implement at all -----------------------------------
// jsdom ships neither matchMedia nor ResizeObserver, so any responsive surface
// throws at mount. Both are supplied here rather than per-test: they are
// environment gaps, not component behavior.

// Breakpoint state driving the matchMedia double. Tests set this with
// setViewportWidth() BEFORE rendering to choose which responsive branch of a
// component mounts (the viewer map, for example, only computes a fit-to-width
// on the >=1024px branch).
let viewportWidth = 1280;

// Parses just the (min-width: Npx) / (max-width: Npx) forms this codebase
// queries. An unrecognized query reports no match rather than guessing.
function evaluateMediaQuery(query) {
  const min = /\(\s*min-width\s*:\s*(\d+)px\s*\)/.exec(query);
  if (min && viewportWidth < Number(min[1])) return false;
  const max = /\(\s*max-width\s*:\s*(\d+)px\s*\)/.exec(query);
  if (max && viewportWidth > Number(max[1])) return false;
  return Boolean(min || max);
}

setGlobal("matchMedia", query => ({
  media: query,
  get matches() {
    return evaluateMediaQuery(query);
  },
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false
}));
dom.window.matchMedia = globalThis.matchMedia;

// Set the viewport width the matchMedia double reports against. Call before
// renderElement — components read breakpoints in mount effects.
export function setViewportWidth(width) {
  viewportWidth = width;
}

// jsdom never lays out, so nothing can ever fire a resize. Components call
// their measure function directly before observing (that first synchronous
// call is what actually runs under test); this records observers only so
// disconnect() in a cleanup path stays a no-op instead of a crash.
class ResizeObserverStub {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
setGlobal("ResizeObserver", ResizeObserverStub);
dom.window.ResizeObserver = ResizeObserverStub;

// jsdom implements no scrolling API on elements at all — it has no layout, so
// scrollTo/scrollIntoView are simply absent and calling one throws. Map
// surfaces scroll a viewport to centre a selected seat, so without these a
// plain seat click dies inside an animation frame. No-ops are the honest
// stand-in: with zero-size geometry there is nothing to scroll, and tests
// assert on selection state rather than scroll offsets.
for (const method of ["scrollTo", "scrollBy", "scrollIntoView"]) {
  if (typeof dom.window.Element.prototype[method] !== "function") {
    dom.window.Element.prototype[method] = function noopScroll() {};
  }
}

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
export function configureContext({ router, supabase, actions, navigation, pathname } = {}) {
  globalThis.__ct = {
    router: { push() {}, replace() {}, refresh() {}, back() {}, prefetch() {}, ...router },
    supabase: supabase ?? { auth: {} },
    actions: actions ?? {},
    // Full-document navigation double (@/lib/fullNavigation) — mocked because
    // jsdom's Location is unforgeable, so the real assign can't be stubbed.
    navigation: { assign() {}, ...navigation },
    // What the next/navigation usePathname mock returns. Components only see
    // a change on their next render — pair setPathname() with a rerender to
    // simulate a route commit.
    pathname: pathname ?? "/"
  };
}

// Simulate the router committing a navigation: the next render observes the
// new pathname (usePathname is read-per-render, exactly like the real hook).
export function setPathname(pathname) {
  globalThis.__ct.pathname = pathname;
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
  "getDraftStatusAction",
  "askPlannerAction",
  "createEmployeeAction",
  "updateEmployeeAction",
  "deleteEmployeeAction",
  "importAssignmentsCsvAction",
  "resetDraftToPublishedAction",
  "createDepartmentAction",
  "renameDepartmentAction",
  "deleteDepartmentAction",
  "createZoneAction",
  "renameZoneAction",
  "deleteZoneAction"
];

const STANDARD_MOCKS = {
  "next/navigation": `
    export const useRouter = () => globalThis.__ct.router;
    export const usePathname = () => globalThis.__ct.pathname ?? "/";
    export const useSearchParams = () => new URLSearchParams(window.location.search);
    export const redirect = () => {};
  `,
  "next/link": `
    import React from "react";
    // Mirrors real App Router Link semantics closely enough for tests: the
    // user onClick runs first; a modified click (new tab) or preventDefault
    // suppresses client navigation; otherwise the click routes through the
    // test router double so suites can assert on router.push.
    export default function Link({ href, children, onClick, prefetch, ...rest }) {
      return React.createElement("a", {
        href,
        ...rest,
        onClick: event => {
          onClick?.(event);
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
            // Real Link would let the browser open a new tab; jsdom can't
            // navigate, so swallow the default to keep test output clean.
            event.preventDefault();
            return;
          }
          if (event.defaultPrevented) return;
          event.preventDefault();
          globalThis.__ct.router.push(href);
        }
      }, children);
    }
    export function useLinkStatus() {
      return { pending: false };
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
  "@/lib/fullNavigation": `export const assignLocation = href => globalThis.__ct.navigation.assign(href);`,
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

// Flush pending animation frames inside act(). jsdom's pretendToBeVisual rAF is
// timer-backed, so a callback scheduled during mount lands ~16ms later —
// outside the render's act() scope, which React reports as an "update was not
// wrapped in act(...)" warning. Await this after rendering a component that
// schedules state in a frame.
export async function flushFrames() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 32));
  });
}
