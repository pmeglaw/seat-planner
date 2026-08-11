#!/usr/bin/env node
// Load a route in a real browser N times and report what the user actually waited for.
//
// This is the tier that answers "is it slow?" — measure-bundle.mjs only knows
// what the build produced. Metrics are collected the way the browser defines
// them (PerformanceObserver, navigation timing), not by wrapping timers around
// Playwright calls, so the numbers mean the same thing they do in Chrome
// DevTools or a Lighthouse run.
//
// Auth: signs in ONCE with the seeded e2e user and reuses the session across
// runs, while each run still gets a fresh browser context — so every load is
// cold-cache but warm-auth. Re-authenticating per run would fold Supabase Auth
// latency into every sample and measure the wrong thing.
//
// Reports the MEDIAN of N runs with the spread alongside. A single load is
// noise; the median of 5 is a number worth acting on.
//
// Usage (needs the app running — `npm run dev`, or `npm run start` after a build):
//   node .claude/skills/web-app-performance/scripts/measure-runtime.mjs --route /
//   node .../measure-runtime.mjs --route /admin --runs 7 --cpu 4
//   node .../measure-runtime.mjs --route / --json > baseline.json
//
// Flags:
//   --route <path>   route to load (repeatable)         default /
//   --runs <n>       loads per route                    default 5
//   --cpu <n>        CPU throttle multiplier (4 ≈ a mid-range laptop)
//   --url <origin>   app origin                         default $SEAT_PLANNER_URL or http://localhost:3000
//   --no-login       skip sign-in (for /login and the /concepts/* prototypes)
//   --json           machine-readable output

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { numericFlag, percentile, samePath } from "./measure-shared.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const routes = argv.reduce((acc, arg, i) => (arg === "--route" ? [...acc, argv[i + 1]] : acc), []);
const ROUTES = routes.length ? routes : ["/"];
// Validated before the browser launches: --runs 0 previously produced an empty
// sample set and crashed on samples[0] after doing all the work.
let RUNS;
let CPU;
try {
  RUNS = numericFlag(argv, "--runs", { fallback: 5, min: 1, integer: true });
  CPU = numericFlag(argv, "--cpu", { fallback: 1, min: 1 });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const BASE = flag("--url", process.env.SEAT_PLANNER_URL || "http://localhost:3000");
const LOGIN = !argv.includes("--no-login");
const AS_JSON = argv.includes("--json");

// Plain node doesn't load .env.local — same lookup the run-seat-planner driver uses.
function envLocal(key) {
  if (process.env[key]) return process.env[key];
  try {
    const match = readFileSync(path.join(REPO, ".env.local"), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const log = (...args) => {
  if (!AS_JSON) console.log(...args);
};

// Registered before any app code runs, so `buffered: true` can't miss an entry
// that fired during hydration.
const COLLECTOR = `
  window.__perf = { lcp: 0, cls: 0, longTasks: [] };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.__perf.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {}
`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });

// --- one sign-in, reused as storage state ----------------------------------
let storageState;
if (LOGIN) {
  const email = envLocal("SEAT_PLANNER_E2E_EMAIL");
  const password = envLocal("SEAT_PLANNER_E2E_PASSWORD");
  if (!email || !password) {
    console.error(
      "SEAT_PLANNER_E2E_EMAIL / SEAT_PLANNER_E2E_PASSWORD not found in env or .env.local.\n" +
        "Every real route redirects to /login without them. Pass --no-login to measure /login\n" +
        "or the /concepts/* prototypes, which need no session."
    );
    await browser.close();
    process.exit(1);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  let signedIn = false;
  for (let attempt = 0; attempt < 4 && !signedIn; attempt++) {
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").fill(password);
    await page.locator('button:text-is("Sign in")').click();
    signedIn = await page
      .waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!signedIn) {
    console.error("Sign-in never navigated away from /login — check the credentials and that the app is up.");
    await browser.close();
    process.exit(1);
  }
  storageState = await context.storageState();
  await context.close();
  log(`signed in as ${email}`);
}

const median = values => percentile(values, 50);

const results = [];
for (const route of ROUTES) {
  const samples = [];
  for (let run = 0; run < RUNS; run++) {
    // Fresh context per run = empty HTTP cache, so each sample is a cold load.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
    await context.addInitScript(COLLECTOR);
    const page = await context.newPage();
    if (CPU > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    }

    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 60000 });
    // LCP is only final once the page stops changing; networkidle plus a beat
    // lets hydration and the map raster settle before we read the observers.
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Any redirect means the numbers below describe a different page than the
    // one being reported, so refuse rather than mislabel. Trailing-slash
    // normalisation is the one benign case and samePath absorbs it.
    const landed = new URL(page.url()).pathname;
    if (!samePath(landed, route)) {
      const isLoginRedirect = landed.startsWith("/login") && route !== "/login";
      console.error(
        `${route} redirected to ${landed}, so this would report ${landed}'s numbers as ${route}.\n` +
          (isLoginRedirect
            ? LOGIN
              ? "The sign-in succeeded but the session was rejected on this route — check the account's role."
              : "Drop --no-login so the script signs in first."
            : `Measure ${landed} directly if that is the page you meant.`)
      );
      await context.close();
      await browser.close();
      process.exit(1);
    }

    samples.push(
      await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] ?? {};
        const scripts = performance
          .getEntriesByType("resource")
          .filter(entry => entry.initiatorType === "script" || entry.name.endsWith(".js"));
        return {
          ttfb: nav.responseStart ?? 0,
          domContentLoaded: nav.domContentLoadedEventEnd ?? 0,
          load: nav.loadEventEnd ?? 0,
          lcp: window.__perf.lcp,
          cls: window.__perf.cls,
          longTaskMs: window.__perf.longTasks.reduce((sum, ms) => sum + ms, 0),
          jsTransferredKb:
            scripts.reduce((sum, entry) => sum + (entry.encodedBodySize || entry.transferSize || 0), 0) / 1024,
          domNodes: document.getElementsByTagName("*").length,
          seatMarkers: document.querySelectorAll("[data-seat-id]").length
        };
      })
    );
    await context.close();
    log(`  ${route} run ${run + 1}/${RUNS}`);
  }

  const keys = Object.keys(samples[0]);
  const summary = { route, runs: RUNS, cpuThrottle: CPU };
  for (const key of keys) {
    const values = samples.map(sample => sample[key]);
    summary[key] = { median: median(values), min: Math.min(...values), max: Math.max(...values) };
  }
  results.push({ ...summary, samples });
}

await browser.close();

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, results }, null, 2));
  process.exit(0);
}

const row = (label, value, unit = "ms", digits = 0) =>
  `  ${label.padEnd(22)} ${value.median.toFixed(digits).padStart(8)} ${unit.padEnd(3)}  (${value.min.toFixed(digits)}–${value.max.toFixed(digits)})`;

console.log(`\n${BASE} — median of ${RUNS} cold loads${CPU > 1 ? `, CPU throttled ${CPU}×` : ""}\n`);
for (const result of results) {
  console.log(`${result.route}`);
  console.log(row("TTFB", result.ttfb));
  console.log(row("LCP", result.lcp));
  console.log(row("DOMContentLoaded", result.domContentLoaded));
  console.log(row("load", result.load));
  console.log(row("CLS", result.cls, "", 3));
  console.log(row("long tasks (total)", result.longTaskMs));
  console.log(row("JS transferred", result.jsTransferredKb, "KB"));
  console.log(row("DOM nodes", result.domNodes, ""));
  console.log(row("seat markers", result.seatMarkers, ""));
  console.log("");
}
console.log(
  `Reading these: TTFB is server work (auth + Supabase queries — these pages are force-dynamic,\n` +
    `so nothing is cached). LCP over TTFB is client work. Long-task total is the hydration cost of\n` +
    `the big client components. "seat markers" vs. the real seat count is a correctness check:\n` +
    `fewer markers than seats means the map is drawing a partial floor plan.\n`
);
