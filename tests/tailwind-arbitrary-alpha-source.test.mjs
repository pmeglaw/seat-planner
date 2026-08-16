import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

// Tailwind v3 cannot apply a slash-opacity modifier to an arbitrary var()
// color: `bg-[var(--x)]/45` produces NO CSS — the whole utility is silently
// dropped, so the scrim/ring/accent it was meant to paint never exists in the
// compiled sheet. And the tempting repair `rgba(var(--x-rgb),0.45)` is ALSO
// invisible: the channel tokens are space-separated (`22 22 22`), and
// `rgba(22 22 22, 0.45)` mixes legacy comma syntax with modern channels, so
// the browser drops the declaration at parse time. The one working form is
// modern slash syntax over the channel token: `bg-[rgb(var(--x-rgb)/0.45)]`.
// Both silent-loss forms are banned here.
const BROKEN_ALPHA_ON_VAR =
  /[a-z-]+-\[var\(--[a-z0-9-]+\)\]\/[0-9.]+|rgba?\(var\(--[a-z0-9-]+-rgb\),/g;

async function walkTsx(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walkTsx(path, out);
    else if (/\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("no slash-opacity on arbitrary var() colors (Tailwind v3 drops the utility silently)", async () => {
  const roots = ["components", "app"].map((d) => new URL(`../${d}`, import.meta.url).pathname);
  const offenders = [];
  for (const root of roots) {
    for (const file of await walkTsx(root)) {
      const source = await readFile(file, "utf8");
      for (const match of source.match(BROKEN_ALPHA_ON_VAR) ?? []) {
        offenders.push(`${file}: ${match}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these utilities compile to nothing — use rgb(var(--…-rgb)/a) instead:\n${offenders.join("\n")}`
  );
});

test("every auto-focused seat-map dialog suppresses the UA focus outline on its container", async () => {
  // Each role="dialog" container is auto-focused by useDialogFocus; without
  // focus-visible:outline-none the browser draws its default blue ring on the
  // keyboard-open path. Checked per dialog function — a file-wide count lets
  // one dialog's extra suppression (e.g. on its close button) mask another
  // dialog's missing one. Covers every seat-map file that mounts an
  // auto-focused dialog, not just the extracted dialogs module.
  const files = ["../components/seat-map/SeatMapDialogs.tsx", "../components/seat-map/AskPlannerDrawer.tsx"];
  const missing = [];
  let sawDialog = false;
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    for (const body of source.split(/(?=export (?:default )?function )/)) {
      if (!body.includes('role="dialog"')) continue;
      sawDialog = true;
      const name = /export (?:default )?function (\w+)/.exec(body)?.[1] ?? "(unnamed)";
      // The container is the element carrying role="dialog" — check the first
      // className after that attribute (still inside the opening tag), so a
      // suppressed inner button can't satisfy the rule. A bare end-of-tag
      // regex breaks on JSX arrow props (`onKeyDown={e => …}`).
      const afterRole = body.slice(body.indexOf('role="dialog"'));
      const containerClass = /className="([^"]*)"/.exec(afterRole)?.[1] ?? "";
      if (!containerClass.includes("focus-visible:outline-none")) missing.push(name);
    }
  }
  assert.ok(sawDialog, 'expected role="dialog" containers in the checked files');
  assert.deepEqual(missing, [], `dialogs without focus-visible:outline-none show the UA blue outline: ${missing.join(", ")}`);
});
