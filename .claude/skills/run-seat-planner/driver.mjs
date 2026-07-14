#!/usr/bin/env node
// Headless-Chromium driver for seat-planner. Agent tooling, not product code.
//
//   node .claude/skills/run-seat-planner/driver.mjs --smoke   # scripted smoke flow
//   node .claude/skills/run-seat-planner/driver.mjs           # REPL: commands on stdin
//
// Requires the dev server to already be running (npm run dev). Uses the
// project's @playwright/test dependency and its installed Chromium.
// Screenshots land in output/playwright/ (repo-relative), latest also
// written as output/playwright/latest.png.

import { chromium } from "@playwright/test";
import readline from "node:readline";
import { mkdirSync, copyFileSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "../../..");

// Plain node doesn't load .env.local — pull the e2e credentials from it
// (they are gitignored; seeded viewer-role user, see SKILL.md).
function envLocal(key) {
  if (process.env[key]) return process.env[key];
  try {
    const match = readFileSync(path.join(REPO, ".env.local"), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : undefined;
  } catch { return undefined; }
}

const BASE = process.env.SEAT_PLANNER_URL || "http://localhost:3000";
const E2E_EMAIL = envLocal("SEAT_PLANNER_E2E_EMAIL");
const E2E_PASSWORD = envLocal("SEAT_PLANNER_E2E_PASSWORD");
const SHOTS = path.join(REPO, "output/playwright");
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

let shotCount = 0;
async function ss(name) {
  const file = path.join(SHOTS, `${name || `shot-${String(++shotCount).padStart(2, "0")}`}.png`);
  await page.screenshot({ path: file, fullPage: false });
  copyFileSync(file, path.join(SHOTS, "latest.png"));
  console.log(`screenshot: ${file}`);
}

// Sign in as the seeded viewer-role e2e user and land on the published map.
async function login() {
  if (!E2E_EMAIL || !E2E_PASSWORD) throw new Error("SEAT_PLANNER_E2E_EMAIL/PASSWORD not set (env or .env.local)");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  // The login page is a real <form> with an always-enabled submit, so the old
  // button-disabled hydration fence is gone. Wait for hydration (networkidle),
  // then fill+submit; an "Enter your ..." validation alert means the fill
  // landed before React attached its handlers — re-fill and retry.
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  const signIn = page.locator('button:text-is("Sign in")');
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator("input[type=email]").fill(E2E_EMAIL);
    await page.locator("input[type=password]").fill(E2E_PASSWORD);
    await signIn.click();
    try {
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
      console.log(`logged in as ${E2E_EMAIL} — url: ${page.url()}`);
      return;
    } catch {}
    const alertText = await page.locator("main [role=alert]").innerText().catch(() => "");
    if (!/enter your/i.test(alertText)) throw new Error(`login failed${alertText ? `: ${alertText}` : ": no navigation"}`);
  }
  throw new Error("login failed: form never accepted the filled credentials");
}

const commands = {
  login: async () => login(),
  nav: async (url) => { await page.goto(url.startsWith("http") ? url : BASE + url, { waitUntil: "domcontentloaded" }); console.log(`url: ${page.url()}`); },
  wait: async (sel) => { await page.locator(sel).first().waitFor({ timeout: 15000 }); console.log("ok"); },
  waittext: async (text) => { await page.getByText(text).first().waitFor({ timeout: 15000 }); console.log("ok"); },
  click: async (sel) => { await page.locator(sel).first().click(); console.log("ok"); },
  fill: async (arg) => { const [sel, ...rest] = arg.split(" "); await page.locator(sel).first().fill(rest.join(" ")); console.log("ok"); },
  press: async (key) => { await page.keyboard.press(key); console.log("ok"); },
  text: async (sel) => console.log(await page.locator(sel).first().innerText()),
  title: async () => console.log(await page.title()),
  url: async () => console.log(page.url()),
  ss: async (name) => ss(name),
  errors: async () => console.log(consoleErrors.length ? consoleErrors.join("\n") : "(no console errors)"),
  quit: async () => { await browser.close(); process.exit(0); },
};

async function run(line) {
  const [cmd, ...rest] = line.trim().split(" ");
  if (!cmd) return;
  const fn = commands[cmd];
  if (!fn) { console.log(`unknown command: ${cmd} (have: ${Object.keys(commands).join(", ")})`); return; }
  try { await fn(rest.join(" ")); } catch (err) { console.log(`ERROR: ${err.message.split("\n")[0]}`); }
}

if (process.argv.includes("--smoke")) {
  let failed = false;
  const check = (label, ok) => { console.log(`${ok ? "PASS" : "FAIL"}: ${label}`); if (!ok) failed = true; };

  // 1. Login page renders the sign-in form.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("input[type=email]").waitFor({ timeout: 15000 });
  check("/login renders the sign-in form", await page.locator("input[type=password]").isVisible());
  await ss("smoke-login");

  // 2. Auth guard: unauthenticated / redirects to /login.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 15000 });
  check("unauthenticated / redirects to /login", page.url().includes("/login"));

  // 3. Real round-trip to Supabase Auth: bad credentials surface an alert.
  await page.locator("input[type=email]").fill("smoke-test@example.com");
  await page.locator("input[type=password]").fill("definitely-wrong-password");
  // Not a <form>: the submit is a plain onClick Button, so target it by text.
  await page.locator('button:text-is("Sign in")').click();
  // Scope to <main>: Next's route announcer is an always-present empty [role=alert] on <body>.
  await page.locator("main [role=alert]").waitFor({ timeout: 20000 });
  check("bad credentials show an error alert", (await page.locator("main [role=alert]").innerText()).length > 0);
  await ss("smoke-login-error");

  // 4. Authenticated viewer flow with the seeded e2e user (skipped if creds absent).
  if (E2E_EMAIL && E2E_PASSWORD) {
    await login();
    check("seeded user lands on the viewer map at /", new URL(page.url()).pathname === "/");
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    check("viewer map shows the floor plan", await page.locator("main img").first().isVisible());
    await ss("smoke-viewer-map");
  } else {
    console.log("SKIP: authenticated viewer flow (no SEAT_PLANNER_E2E_EMAIL/PASSWORD)");
  }

  // 5. Dev-only prototype route renders without auth (NODE_ENV !== production).
  await page.goto(`${BASE}/concepts/map-redesign`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  check("/concepts/map-redesign renders (dev prototype)", !(await page.title()).includes("404"));
  await ss("smoke-map-redesign");

  console.log(consoleErrors.length ? `console errors:\n${consoleErrors.join("\n")}` : "no console errors");
  await browser.close();
  process.exit(failed ? 1 : 0);
}

console.log(`driver ready — base ${BASE}. Commands: ${Object.keys(commands).join(", ")}`);
const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) await run(line);
await browser.close();
