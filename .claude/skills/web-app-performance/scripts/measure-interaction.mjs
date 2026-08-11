#!/usr/bin/env node
// Measure what the main thread does DURING an interaction, not during load.
//
// Load metrics say nothing about whether panning the map stutters. This drives
// a scripted gesture and reports frame timing plus long tasks across the
// interaction window, so "it feels janky" becomes a number you can re-measure
// after a fix.
//
// The headline number is frames over budget. At 60 fps a frame has ~16.7 ms; a
// frame that takes longer means the user saw a stutter. Median frame time hides
// exactly the spikes people complain about, so p95 is reported alongside.
//
// Usage (needs the app running and, for map gestures, a session):
//   node .../measure-interaction.mjs --route /admin --interaction hover
//   node .../measure-interaction.mjs --route / --interaction zoom --cpu 4
//   node .../measure-interaction.mjs --route /login --interaction type \
//        --selector "input[type=email]" --text "someone@example.com" --no-login
//
// Interactions:
//   hover  move the pointer across seat markers (memoization pressure)
//   pan    drag across the map viewport (scroll-through-ref path)
//   zoom   click Zoom in / Zoom out alternately (re-runs the crowding pipeline)
//   type   type into --selector (filter/search input re-render cost)
//
// Flags: --route --url --runs --cpu --steps --selector --text --no-login --json

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const ROUTE = flag("--route", "/");
const BASE = flag("--url", process.env.SEAT_PLANNER_URL || "http://localhost:3000");
const RUNS = Number(flag("--runs", 3));
const CPU = Number(flag("--cpu", 1));
const STEPS = Number(flag("--steps", 25));
const INTERACTION = flag("--interaction", "hover");
const SELECTOR = flag("--selector", null);
const TEXT = flag("--text", "conference");
const LOGIN = !argv.includes("--no-login");
const AS_JSON = argv.includes("--json");

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

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });

let storageState;
if (LOGIN) {
  const email = envLocal("SEAT_PLANNER_E2E_EMAIL");
  const password = envLocal("SEAT_PLANNER_E2E_PASSWORD");
  if (!email || !password) {
    console.error("SEAT_PLANNER_E2E_EMAIL / SEAT_PLANNER_E2E_PASSWORD not found. Pass --no-login for public routes.");
    await browser.close();
    process.exit(1);
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").fill(password);
    await page.locator('button:text-is("Sign in")').click();
    ok = await page
      .waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!ok) {
    console.error("Sign-in never navigated away from /login.");
    await browser.close();
    process.exit(1);
  }
  storageState = await context.storageState();
  await context.close();
  log(`signed in as ${email}`);
}

// Frame timing is sampled with rAF rather than a trace, so the script stays
// dependency-free and the numbers stay comparable between runs. Long tasks come
// from the browser's own observer.
const RECORDER = `
  window.__rec = { frames: [], longTasks: [] };
  window.__recStart = () => {
    window.__rec = { frames: [], longTasks: [], recording: true };
    let previous = performance.now();
    const tick = now => {
      if (!window.__rec.recording) return;
      window.__rec.frames.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      window.__recObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__rec.longTasks.push(entry.duration);
      });
      window.__recObserver.observe({ type: "longtask", buffered: false });
    } catch {}
  };
  window.__recStop = () => {
    window.__rec.recording = false;
    try { window.__recObserver.disconnect(); } catch {}
    // Drop the first frame: it spans from recording start to the first rAF and
    // measures setup latency, not the interaction.
    return { frames: window.__rec.frames.slice(1), longTasks: window.__rec.longTasks };
  };
`;

/** Run the named gesture. Throws a readable error when the surface isn't there. */
async function performInteraction(page) {
  if (INTERACTION === "type") {
    const selector = SELECTOR ?? 'input[type="search"], input[placeholder^="Search"]';
    const field = page.locator(selector).first();
    if ((await field.count()) === 0) throw new Error(`no element matched ${selector} on ${ROUTE}`);
    await field.click();
    // delay spreads keystrokes over frames so per-keystroke render cost is visible.
    await field.pressSequentially(TEXT, { delay: 60 });
    return;
  }

  if (INTERACTION === "zoom") {
    const zoomIn = page.locator('button[aria-label="Zoom in"]');
    const zoomOut = page.locator('button[aria-label="Zoom out"]');
    if ((await zoomIn.count()) === 0) throw new Error(`no zoom control on ${ROUTE} — is this a map surface?`);
    for (let step = 0; step < STEPS; step++) {
      const target = step % 2 === 0 ? zoomIn : zoomOut;
      if (await target.isEnabled()) await target.click();
      await page.waitForTimeout(40);
    }
    return;
  }

  const markers = page.locator("[data-seat-id]");
  const markerCount = await markers.count();
  if (markerCount === 0) {
    throw new Error(
      `no seat markers on ${ROUTE}. The map needs a session with data — ` +
        `a viewer-role account on /admin renders the access-denied view, which has no markers.`
    );
  }

  if (INTERACTION === "hover") {
    for (let step = 0; step < Math.min(STEPS, markerCount); step++) {
      const box = await markers.nth(step).boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(16);
    }
    return;
  }

  if (INTERACTION === "pan") {
    const box = await markers.first().boundingBox();
    if (!box) throw new Error("could not locate a marker to anchor the pan gesture");
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    for (let step = 0; step < STEPS; step++) {
      await page.mouse.move(box.x + step * 6, box.y + step * 3);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    return;
  }

  throw new Error(`unknown --interaction ${INTERACTION} (hover | pan | zoom | type)`);
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

// A frame INTERVAL of ~16.7 ms is a healthy 60 fps, so counting everything above
// the budget flags a perfectly smooth interaction as janky. What the user
// actually sees as a stutter is a missed vsync: an interval of two frames or
// more. Hence 2× budget.
const BUDGET_MS = 1000 / 60;
const DROPPED_MS = BUDGET_MS * 2;
const samples = [];

for (let run = 0; run < RUNS; run++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const page = await context.newPage();
  if (CPU > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  }
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);

  const landed = new URL(page.url()).pathname;
  if (landed !== ROUTE && landed.startsWith("/login") && ROUTE !== "/login") {
    console.error(`${ROUTE} redirected to ${landed} — no valid session, so this would measure the login page.`);
    await browser.close();
    process.exit(1);
  }

  await page.evaluate(RECORDER);
  await page.evaluate("window.__recStart()");
  try {
    await performInteraction(page);
  } catch (error) {
    console.error(`${error.message}`);
    await browser.close();
    process.exit(1);
  }
  const result = await page.evaluate("window.__recStop()");
  await context.close();

  const frames = result.frames.filter(ms => ms > 0);
  samples.push({
    frames: frames.length,
    medianFrameMs: percentile(frames, 50),
    p95FrameMs: percentile(frames, 95),
    worstFrameMs: Math.max(0, ...frames),
    droppedFrames: frames.filter(ms => ms >= DROPPED_MS).length,
    longTaskCount: result.longTasks.length,
    longTaskMs: result.longTasks.reduce((sum, ms) => sum + ms, 0)
  });
  log(`  run ${run + 1}/${RUNS}`);
}

const median = key => percentile(samples.map(sample => sample[key]), 50);

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, route: ROUTE, interaction: INTERACTION, cpu: CPU, samples }, null, 2));
  process.exit(0);
}

const dropped = median("droppedFrames");
const frames = median("frames");
console.log(`\n${BASE}${ROUTE} — "${INTERACTION}" × ${STEPS} steps, median of ${RUNS} runs${CPU > 1 ? `, CPU ${CPU}×` : ""}\n`);
console.log(`  frames rendered        ${frames.toFixed(0)}`);
console.log(`  dropped (≥33 ms)       ${dropped.toFixed(0)}  (${frames ? ((dropped / frames) * 100).toFixed(0) : 0}%)`);
console.log(`  median frame           ${median("medianFrameMs").toFixed(1)} ms`);
console.log(`  p95 frame              ${median("p95FrameMs").toFixed(1)} ms`);
console.log(`  worst frame            ${median("worstFrameMs").toFixed(1)} ms`);
console.log(`  long tasks             ${median("longTaskCount").toFixed(0)} totalling ${median("longTaskMs").toFixed(0)} ms`);
console.log(
  `\nA smooth interaction sits at a ~16.7 ms median with almost no dropped frames — that is 60 fps,\n` +
    `not a problem to fix. What matters is p95 and worst: a high p95 over a healthy median is the\n` +
    `signature of periodic expensive work, in this app usually the O(n²) de-collision pipeline\n` +
    `recomputing because a memo dependency stopped being identity-stable.\n` +
    `See references/hot-spots.md, "Render and interaction cost".\n`
);

await browser.close();
