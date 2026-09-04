// Builds the SeatMap browser-test harness: esbuild bundles the REAL SeatMap into
// a self-contained IIFE (React included) with the server/framework boundaries
// swapped for doubles that call back into Node via window.__ctCall, then writes
// bundle.js + harness.html. Playwright loads the harness in a real Chromium so
// SeatMap's live layout/de-collision measurement actually converges (it can't in
// jsdom). See playwright-ct.config.ts (globalSetup) and harness.ts (mount).
//
// Paths derive from process.cwd() (the project root Playwright runs from) rather
// than import.meta.url, because Playwright transpiles this module to CJS.

import * as esbuild from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = `${process.cwd()}/`;
export const HARNESS_DIR = path.join(ROOT, "node_modules/.cache/ctb");
export const HARNESS_HTML = path.join(HARNESS_DIR, "harness.html");

const ACTION_EXPORTS = [
  "updateSeatAction",
  "createSeatAction",
  "deleteSeatAction",
  "swapSeatAssignmentsAction",
  "publishSeatMapAction",
  "resetDraftToPublishedAction",
  "restoreDraftSnapshotAction",
  "getPublishHistoryAction",
  "getDraftStatusAction",
  "askPlannerAction",
  "createEmployeeAction",
  "updateEmployeeAction",
  "deleteEmployeeAction"
];

// Every boundary delegates to window.__ctCall(name, args), which Playwright
// exposes from Node — so a test both observes the call and decides its result.
const MOCKS: Record<string, string> = {
  "@/app/actions": ACTION_EXPORTS.map(
    name => `export const ${name} = async (...args) => window.__ctCall(${JSON.stringify(`action:${name}`)}, args);`
  ).join("\n"),
  "next/navigation": `
    export const useRouter = () => ({
      push: p => window.__ctCall("router.push", [p]),
      replace: p => window.__ctCall("router.replace", [p]),
      refresh: () => window.__ctCall("router.refresh", []),
      back() {}, forward() {}, prefetch() {}
    });
    // "/admin": the harness mounts SeatMap inside the real AppShell (see
    // ENTRY), and the shell derives the rail's active item + whether the
    // sub-page brand bar renders from the pathname — the map surface is what
    // these specs exercise.
    export const usePathname = () => "/admin";
    export const useSearchParams = () => new URLSearchParams("");
    export const redirect = () => {};
  `,
  "next/link": `import React from "react";
    // Real-Link-ish double: user onClick first; modified clicks and
    // preventDefault suppress navigation; otherwise route through the
    // harness router so specs assert on router.push instead of the
    // browser actually leaving harness.html.
    export default function Link({ href, children, onClick, prefetch, ...rest }) {
      return React.createElement("a", { href, ...rest, onClick: event => {
        onClick?.(event);
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        if (event.defaultPrevented) return;
        event.preventDefault();
        window.__ctCall("router.push", [href]);
      } }, children);
    }
    export function useLinkStatus() { return { pending: false }; }`,
  "next/image": `import React from "react";
    export default function Image({ src, alt = "" }) {
      const resolved = typeof src === "object" && src ? (src.src ?? "") : src;
      return React.createElement("img", { src: resolved, alt });
    }`,
  // getUser defaults to a valid session so SeatMap's canEdit+actionError
  // session-expiry probe (auth.getUser()) doesn't crash the mount; a test can
  // still override it via responses["supabase.getUser"] like the other mocks.
  "@/lib/supabase/client": `export const createClient = () => ({ auth: {
    signOut: async () => window.__ctCall("supabase.signOut", []),
    getUser: async () => (await window.__ctCall("supabase.getUser", [])) ?? { data: { user: { id: "harness-user" } }, error: null }
  } });`
};

function mockPlugin(): esbuild.Plugin {
  const filter = new RegExp(`^(${Object.keys(MOCKS).map(n => n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})$`);
  return {
    name: "ctb-mocks",
    setup(build) {
      build.onResolve({ filter }, args => ({ path: args.path, namespace: "ctb-mock" }));
      // resolveDir lets the mock modules' own `import React` resolve node_modules.
      build.onLoad({ filter: /.*/, namespace: "ctb-mock" }, args => ({ loader: "js", contents: MOCKS[args.path], resolveDir: ROOT }));
    }
  };
}

const ENTRY = `
  import React from "react";
  import { createRoot } from "react-dom/client";
  import { AppShell } from "@/components/ui/AppShell";
  import { SeatMap } from "@/components/seat-map/SeatMap";
  let root;
  // The shell lives in the persistent AppShell (app/(shell)/layout.tsx), so
  // the harness composes the same pair production does — the specs that
  // drive the shell (the guarded History mode switch) exercise the real
  // SeatMap -> useAppShellNavigation -> AppShell wiring.
  window.__mountSeatMap = props => {
    root = root ?? createRoot(document.getElementById("root"));
    root.render(
      React.createElement(
        AppShell,
        { email: "harness@example.com", isAdmin: true },
        React.createElement(SeatMap, props)
      )
    );
  };
`;

export async function buildHarness() {
  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    format: "iife",
    jsx: "automatic",
    tsconfig: path.join(ROOT, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [mockPlugin()],
    write: false,
    logLevel: "silent"
  });
  await mkdir(HARNESS_DIR, { recursive: true });
  await writeFile(path.join(HARNESS_DIR, "bundle.js"), result.outputFiles[0].text, "utf8");
  await writeFile(
    HARNESS_HTML,
    // lang="en" mirrors app/layout.tsx. Without it the harness itself trips
    // axe's html-has-lang in accessibility.spec.ts — a harness artefact that
    // says nothing about the app, so keep the shell faithful rather than
    // disabling the rule.
    `<!doctype html><html lang="en"><head><meta charset="utf8"><title>SeatMap harness</title></head><body><div id="root"></div><script src="./bundle.js"></script></body></html>`,
    "utf8"
  );
  return HARNESS_HTML;
}
