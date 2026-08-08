import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { assignLocation } = await importTsModule("lib/fullNavigation.ts");

// lib/fullNavigation.ts is the sanctioned full-document-navigation escape
// hatch. The jsdom component tests swap the whole module at bundle time, so
// nothing there executes the real implementation — this does.

test("assignLocation performs a full document load via window.location.assign", (t) => {
  const assigned = [];
  const hadWindow = "window" in globalThis;
  const savedWindow = globalThis.window;
  globalThis.window = { location: { assign: (href) => assigned.push(href) } };
  t.after(() => {
    if (hadWindow) globalThis.window = savedWindow;
    else delete globalThis.window;
  });

  assignLocation("/admin?next=1");

  assert.deepEqual(assigned, ["/admin?next=1"]);
});

test("the sanctioned-caller list stays accurate: only the documented modules import assignLocation", async () => {
  // The module comment names the sanctioned callers (auth landings + AppRail's
  // skew fallback and stalled-nav watchdog). A new importer is a new
  // full-document navigation — the #333 blank-flash class — and must be a
  // deliberate decision, so this enumerates the real import sites.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", [
    "grep",
    "-l",
    "from \"@/lib/fullNavigation\"",
    "--",
    "app",
    "components",
    "lib"
  ]);
  const importers = stdout.trim().split("\n").filter(Boolean).sort();
  assert.deepEqual(importers, [
    "components/auth/LoginForm.tsx",
    "components/auth/UpdatePasswordForm.tsx",
    "components/seat-map/SeatMap.tsx",
    "components/ui/AppRail.tsx"
  ]);
});

test("copy contract: the shared publish-impact note reassures about the draft/published split", async () => {
  // lib/copy.ts is the one shared user-facing sentence for pure-generic
  // publish-impact reassurance; dialogs with action-specific warnings keep
  // their own wording (pinned by the destructive-action safety tests).
  const { PUBLISH_IMPACT_NOTE } = await importTsModule("lib/copy.ts");
  assert.equal(typeof PUBLISH_IMPACT_NOTE, "string");
  assert.match(PUBLISH_IMPACT_NOTE, /publish/i);
  assert.match(PUBLISH_IMPACT_NOTE, /viewers/i);
  const source = await readFile(new URL("../lib/copy.ts", import.meta.url), "utf8");
  assert.match(source, /export const PUBLISH_IMPACT_NOTE/);
});
