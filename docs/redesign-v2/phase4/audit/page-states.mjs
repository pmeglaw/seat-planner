// Phase 4 · PR 4 page-state captures (rerun on every PR that touches Management or Settings).
// Drives the two document pages through their component states and screenshots each one, both
// themes at 1920×1080, plus the 1280×800 laptop and the 1024×768 narrow frame (light) per page.
// Nothing here mutates: every sheet and modal is opened and CANCELLED; the file pickers receive
// throwaway buffers; the exports write to the browser's download dir only.
// Usage: node docs/redesign-v2/phase4/audit/page-states.mjs <baseUrl> <outDir> <adminEmail> <adminPassword> [viewerEmail]
// Run against the LOCAL Docker stack only (npm run db:start + db:seed) — never against production:
// the seeded local admin is e2e-admin@example.test, the seeded viewer e2e-viewer@example.test
// (tests/e2e-auth/auth-helpers.ts; one password for both).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");
const [base = "http://localhost:3000", outDir = "out", email, password, viewerEmail] = process.argv.slice(2);
if (!email || !password) {
  console.error("admin email + password required (the seeded local admin)");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

const signIn = async who => {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', who);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 30000 });
};
const shot = async (name, clip) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false, ...(clip ? { clip } : {}) });
  console.log(`captured ${name}`);
};
const open = async (route, theme, width = 1920, height = 1080) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(t => { localStorage.setItem("sp-theme", t); }, theme);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
};
const escape = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
const clipOf = async (locator, pad = 8) => {
  const box = await locator.boundingBox();
  return box ? { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad } : undefined;
};
const CSV_HEADER = "seat_label,employee_name,employee_email,position,department,zone,status,notes\n";

await signIn(email);

for (const theme of ["light", "dark"]) {
  // ---------------------------------------------------------------- Management
  await open("/admin/management", theme);
  await page.locator("[data-directory-row]").first().waitFor();
  await shot(`management-${theme}-1920`);
  const tabs = page.getByRole("navigation", { name: "Management sections" });
  await shot(`management-tabs-rest-${theme}`, await clipOf(tabs, 0));
  await page.getByRole("tab", { name: "Departments" }).hover();
  await page.waitForTimeout(200);
  await shot(`management-tabs-hover-${theme}`, await clipOf(tabs, 0));
  await page.getByRole("tab", { name: "Employees" }).focus();
  await page.waitForTimeout(200);
  await shot(`management-tabs-focus-${theme}`, await clipOf(tabs, 0));
  await page.mouse.move(960, 900);

  // Table: row hover with the seat-link step, the Edit tooltip on hover.
  const firstRow = page.locator("[data-directory-row]").first();
  await firstRow.hover();
  await page.waitForTimeout(250);
  await shot(`management-row-hover-${theme}`, await clipOf(firstRow, 4));
  await firstRow.getByRole("button", { name: /^Edit / }).hover();
  await page.waitForTimeout(300);
  await shot(`management-row-edit-tooltip-${theme}`, await clipOf(firstRow, 40));
  await page.mouse.move(960, 900);

  // Search: filtering count, then zero.
  const search = page.getByRole("searchbox", { name: "Search employees" });
  await search.fill("zzz-nobody");
  await page.waitForTimeout(300);
  await shot(`management-zero-search-${theme}-1920`);
  await search.fill("");

  // The panel: Add (empty), Edit (filled, fact row, danger zone), the dirty-close ask, the sheet over the panel.
  await page.getByRole("button", { name: "Add employee" }).click();
  await page.getByRole("dialog", { name: "Add employee" }).waitFor();
  await shot(`management-panel-add-${theme}-1920`);
  await page.getByLabel("Department").fill("Compli");
  await page.waitForTimeout(300);
  await shot(`management-panel-add-combobox-${theme}-1920`);
  await escape(); // closes the listbox
  await escape(); // dirty → the ask
  if (await page.getByRole("alertdialog").count()) {
    await shot(`management-panel-dirty-ask-${theme}-1920`);
    await page.getByRole("button", { name: "Discard changes" }).click();
  }
  await page.waitForTimeout(300);
  await page.locator("[data-directory-row]").first().getByRole("button", { name: /^Edit / }).click();
  await page.getByRole("dialog", { name: "Edit employee" }).waitFor();
  await shot(`management-panel-edit-${theme}-1920`);
  await page.getByRole("button", { name: "Deactivate…" }).click();
  await page.getByRole("dialog", { name: /^Deactivate / }).waitFor();
  await shot(`management-sheet-deactivate-over-panel-${theme}-1920`);
  await page.getByRole("dialog", { name: /^Deactivate / }).getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("dialog", { name: "Edit employee" }).getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);

  // Departments: the list, inline rename (editing + duplicate-invalid), the create modal, the delete sheet.
  await page.getByRole("tab", { name: "Departments" }).click();
  await page.waitForTimeout(400);
  await shot(`management-departments-${theme}-1920`);
  const renames = page.getByRole("button", { name: "Rename" });
  if ((await renames.count()) > 0) {
    await renames.first().click();
    await page.waitForTimeout(300);
    await shot(`management-rename-editing-${theme}-1920`);
    const names = await page.locator(".sp-list-row .sp-list-name").allTextContents();
    const other = names.map(n => n.replace("Not in list", "").trim()).find(n => n && n !== (await page.getByLabel("Department name").inputValue()));
    if (other) {
      await page.getByLabel("Department name").fill(other.toLowerCase());
      await page.getByLabel("Department name").blur();
      await page.waitForTimeout(300);
      await shot(`management-rename-duplicate-${theme}-1920`);
    }
    await escape();
  }
  await page.getByRole("button", { name: "More actions for" .concat(" ", (await page.locator(".sp-list-row .sp-list-name").first().textContent()).replace("Not in list", "").trim()) }).click().catch(() => {});
  if (await page.getByRole("menuitem").count()) {
    await shot(`management-list-overflow-${theme}-1920`);
    await page.getByRole("menuitem", { name: /^Delete / }).click();
    await page.getByRole("dialog", { name: /^Delete department/ }).waitFor();
    await shot(`management-sheet-delete-department-${theme}-1920`);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(300);
  }
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("dialog", { name: "Add department" }).waitFor();
  await shot(`management-create-modal-${theme}-1920`);
  await escape();

  // Zones: the delete sheet.
  await page.getByRole("tab", { name: "Zones" }).click();
  await page.waitForTimeout(400);
  await shot(`management-zones-${theme}-1920`);
  await page.getByRole("button", { name: /^More actions for / }).first().click();
  await page.getByRole("menuitem", { name: /^Delete / }).click();
  await page.getByRole("dialog", { name: /^Delete zone/ }).waitFor();
  await shot(`management-sheet-delete-zone-${theme}-1920`);
  await page.getByRole("button", { name: "Cancel" }).click();

  // ---------------------------------------------------------------- Settings
  await open("/admin/settings", theme);
  await shot(`settings-${theme}-1920`);
  await shot(`settings-callout-${theme}`, await clipOf(page.locator(".sp-callout"), 8));
  // Inline refusal: a wrong type, before any sheet.
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({ name: "roster.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await page.waitForTimeout(400);
  await shot(`settings-csv-refused-inline-${theme}-1920`);
  // The review: ready (a header-only CSV → 0 rows) then blocked (a bad row).
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({ name: "assignments.csv", mimeType: "text/csv", buffer: Buffer.from(`${CSV_HEADER}N01,Sample Person,,Analyst,Litigation,North Pod,assigned,\n`) });
  await page.getByRole("heading", { name: "Review CSV import" }).waitFor();
  await shot(`settings-csv-review-${theme}-1920`);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({ name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from(`${CSV_HEADER},Sample Person,,,,,assigned,\n`) });
  await page.getByRole("heading", { name: "CSV import has blocking errors" }).waitFor();
  await shot(`settings-csv-review-blocked-${theme}-1920`);
  await page.getByRole("button", { name: "Close" }).click();
  // The restore review with the export-first done-state.
  await page.locator('input[accept=".json,application/json"]').setInputFiles({ name: "seat-map-export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), seats: [{ label: "N01" }], employees: [] })) });
  await page.getByRole("heading", { name: "Review draft snapshot restore" }).waitFor();
  await shot(`settings-restore-review-${theme}-1920`);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export the current draft first" }).click()
  ]);
  await download.delete().catch(() => {});
  await page.waitForTimeout(300);
  await shot(`settings-restore-review-exported-${theme}-1920`);
  await page.getByRole("button", { name: "Cancel" }).click();
}

// Laptop + narrow frames (light).
for (const [route, name] of [["/admin/management", "management"], ["/admin/settings", "settings"]]) {
  await open(route, "light", 1280, 800);
  await shot(`${name}-light-1280`);
  await open(route, "light", 1024, 768);
  await shot(`${name}-light-1024`);
}

// The 403 card (a signed-in viewer on the admin pages), both themes.
if (viewerEmail) {
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Account/ }).click().catch(() => {});
  const signOut = page.getByRole("button", { name: /Sign out/ });
  if (await signOut.count()) await signOut.first().click();
  await page.waitForURL(u => u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
  await signIn(viewerEmail);
  for (const theme of ["light", "dark"]) {
    await open("/admin/management", theme);
    await shot(`management-403-${theme}-1920`);
    await open("/admin/settings", theme);
    await shot(`settings-403-${theme}-1920`);
  }
}

console.log(`console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log("  ", e.slice(0, 200));
await browser.close();
