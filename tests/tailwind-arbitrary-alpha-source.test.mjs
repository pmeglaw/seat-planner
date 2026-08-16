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
    `these utilities compile to nothing — use rgba(var(--…-rgb), a) instead:\n${offenders.join("\n")}`
  );
});

test("every seat-map dialog suppresses the UA focus outline on its auto-focused container", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatMapDialogs.tsx", import.meta.url), "utf8");
  // Each role="dialog" section is auto-focused by useDialogFocus; without
  // focus-visible:outline-none the browser draws its default blue ring on the
  // keyboard-open path. Checked per dialog function — a file-wide count lets
  // one dialog's extra suppression (e.g. on its close button) mask another
  // dialog's missing one.
  const bodies = source.split(/(?=export function )/);
  const missing = [];
  for (const body of bodies) {
    if (!body.includes('role="dialog"')) continue;
    const name = /export function (\w+)/.exec(body)?.[1] ?? "(unnamed)";
    if (!body.includes("focus-visible:outline-none")) missing.push(name);
  }
  assert.ok(bodies.some((b) => b.includes('role="dialog"')), 'expected role="dialog" sections in SeatMapDialogs.tsx');
  assert.deepEqual(missing, [], `dialogs without focus-visible:outline-none show the UA blue outline: ${missing.join(", ")}`);
});
