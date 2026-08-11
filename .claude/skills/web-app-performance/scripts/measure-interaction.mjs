#!/usr/bin/env node
// Measure what the main thread does DURING an interaction, not during load.
//
// Load metrics say nothing about whether panning the map stutters. This drives
// a scripted gesture and reports frame timing plus long tasks across the
// interaction window, so "it feels janky" becomes a number you can re-measure
// after a fix.
//
// The headline number is missed frames — vsync slots that went by with nothing
// new on screen, weighted by how long each stall lasted, so one long freeze
// doesn't score the same as one brief hiccup. Stutter count is reported next to
// it because 30 frames lost to 15 small stalls is a different problem from 30
// lost to one. Median frame time hides exactly the spikes people complain
// about, so p95 and worst are reported too.
//
// Usage (needs the app running and, for map gestures, a session):
//   node .../measure-interaction.mjs --route /admin --interaction hover
//   node .../measure-interaction.mjs --route / --interaction zoom --cpu 4
//   node .../measure-interaction.mjs --route /login --interaction type \
//        --selector "input[type=email]" --text "someone@example.com" --no-login
//
// Interactions:
//   hover  move the pointer across seat markers (style/paint; marker hover is CSS)
//   pan    zoom in, then drag from empty canvas (scroll-through-ref path)
//   zoom   click Zoom in / Zoom out alternately (re-runs the crowding pipeline)
//   type   type into --selector (filter/search input re-render cost)
//
// Flags: --route --url --runs --cpu --steps --selector --text --no-login --json

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FRAME_BUDGET_MS,
  isExpectedTarget,
  missedFrames,
  numericFlag,
  percentile,
  stutterIntervals
} from "./measure-shared.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const ROUTE = flag("--route", "/");
const BASE = flag("--url", process.env.SEAT_PLANNER_URL || "http://localhost:3000");
// Validated before the browser launches: a bad --runs used to produce an
// all-zero report that reads like a perfectly smooth interaction.
let RUNS;
let CPU;
let STEPS;
try {
  RUNS = numericFlag(argv, "--runs", { fallback: 3, min: 1, integer: true });
  CPU = numericFlag(argv, "--cpu", { fallback: 1, min: 1 });
  STEPS = numericFlag(argv, "--steps", { fallback: 25, min: 1, integer: true });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
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

// These three run inside the page, so they can't close over anything here —
// each re-finds the map viewport itself. It is the nearest scrollable ancestor
// of a seat marker, which holds on both map surfaces without depending on a
// class name or an id the admin viewport doesn't have.
function hasScrollRoom() {
  let node = document.querySelector("[data-seat-id]")?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) {
      return node.scrollWidth > node.clientWidth + 4 || node.scrollHeight > node.clientHeight + 4;
    }
    node = node.parentElement;
  }
  return false;
}

function scrollOffset() {
  let node = document.querySelector("[data-seat-id]")?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) {
      return { left: Math.round(node.scrollLeft), top: Math.round(node.scrollTop) };
    }
    node = node.parentElement;
  }
  return { left: 0, top: 0 };
}

/** A point inside the viewport that the surface's pan block-list won't reject. */
function findPanAnchor() {
  let viewport = document.querySelector("[data-seat-id]")?.parentElement ?? null;
  while (viewport && viewport !== document.body) {
    const style = getComputedStyle(viewport);
    if (/(auto|scroll)/.test(style.overflowX) || /(auto|scroll)/.test(style.overflowY)) break;
    viewport = viewport.parentElement;
  }
  if (!viewport || viewport === document.body) return null;

  const rect = viewport.getBoundingClientRect();
  // Walk the whole inset grid, nearest-to-centre first. Scanning only one
  // quadrant would report "no empty canvas" on a plan whose free space happens
  // to sit right or below the centre.
  const fractions = [];
  for (let f = 0.1; f <= 0.9001; f += 0.05) fractions.push(Math.round(f * 100) / 100);

  const candidates = [];
  for (const dy of fractions) {
    for (const dx of fractions) {
      candidates.push({ dx, dy, distance: Math.hypot(dx - 0.5, dy - 0.5) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  for (const candidate of candidates) {
    const x = Math.round(rect.x + rect.width * candidate.dx);
    const y = Math.round(rect.y + rect.height * candidate.dy);
    const element = document.elementFromPoint(x, y);
    if (!element || !viewport.contains(element)) continue;
    if (element.closest("button, a, input, select, textarea, [data-seat-id]")) continue;
    return { x, y };
  }
  return null;
}

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
    // Two preconditions decide whether a drag pans anything, and getting either
    // wrong produces a run that reports 60 fps because nothing moved:
    //
    // 1. The press must start on empty canvas. Both map surfaces refuse to
    //    start a pan when the press lands on an interactive target —
    //    `isPanBlockedTarget` in ViewerSeatFinder/SeatMap blocks
    //    `button, a, input, select, textarea, [data-seat-id]` so marker clicks
    //    keep working. Anchoring on a marker, as this gesture used to, is a
    //    guaranteed no-op on both surfaces.
    // 2. There must be somewhere to pan to. At the default zoom the plan is
    //    fitted to the viewport and has no overflow, so we zoom in first.
    const zoomIn = page.locator('button[aria-label="Zoom in"]');
    // Bounded by the zoom range itself, not a round number: MAP_ZOOM_MIN 0.5 to
    // MAP_ZOOM_MAX 2.5 in MAP_ZOOM_STEP 0.25 (lib/mapViewport.ts) is 8 clicks,
    // plus one because the viewer's first click leaves fit mode by setting 1.
    // The disabled check can't be the only exit: the admin control only computes
    // zoomInDisabled in detail mode (SeatMap.tsx), so an unbounded loop would
    // hang in overview instead of failing with a readable message.
    for (let attempt = 0; attempt < 9; attempt++) {
      if (await page.evaluate(hasScrollRoom)) break;
      if ((await zoomIn.count()) === 0 || !(await zoomIn.isEnabled())) break;
      await zoomIn.click();
      await page.waitForTimeout(300);
    }
    if (!(await page.evaluate(hasScrollRoom))) {
      throw new Error(`the map on ${ROUTE} has no scroll room to pan into, even zoomed in`);
    }

    const anchor = await page.evaluate(findPanAnchor);
    if (!anchor) throw new Error(`found no empty canvas on ${ROUTE} to start a pan from`);

    const before = await page.evaluate(scrollOffset);
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.down();
    // Drag up and left: the map starts at scroll origin, so dragging the canvas
    // the other way would hit the scroll boundary and move nothing.
    for (let step = 0; step < STEPS; step++) {
      await page.mouse.move(anchor.x - step * 6, anchor.y - step * 3);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();

    const after = await page.evaluate(scrollOffset);
    if (after.left === before.left && after.top === before.top) {
      throw new Error(
        `the pan drag on ${ROUTE} did not move the map, so this run would report an idle main thread as a smooth pan`
      );
    }
    return;
  }

  throw new Error(`unknown --interaction ${INTERACTION} (hover | pan | zoom | type)`);
}

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
  if (!isExpectedTarget(page.url(), BASE, ROUTE)) {
    console.error(
      `${ROUTE} redirected to ${page.url()}, so this would report that page's numbers as ${ROUTE}.` +
        (landed.startsWith("/login") && ROUTE !== "/login"
          ? LOGIN
            ? "\nThe sign-in succeeded but the session was rejected on this route — check the account's role."
            : "\nDrop --no-login so the script signs in first."
          : `\nMeasure ${landed} directly if that is the page you meant.`)
    );
    await context.close();
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
  const missed = missedFrames(frames);
  samples.push({
    frames: frames.length,
    missedFrames: missed,
    // Denominator is what the compositor SHOULD have presented over the same
    // span — presented plus missed. Dividing by presented alone would let the
    // percentage exceed 100 during a bad stall.
    missedPct: frames.length + missed > 0 ? (missed / (frames.length + missed)) * 100 : 0,
    stutters: stutterIntervals(frames),
    medianFrameMs: percentile(frames, 50),
    p95FrameMs: percentile(frames, 95),
    worstFrameMs: frames.length ? Math.max(...frames) : 0,
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

console.log(`\n${BASE}${ROUTE} — "${INTERACTION}" × ${STEPS} steps, median of ${RUNS} runs${CPU > 1 ? `, CPU ${CPU}×` : ""}\n`);
console.log(`  frames presented       ${median("frames").toFixed(0)}`);
console.log(`  frames missed          ${median("missedFrames").toFixed(0)}  (${median("missedPct").toFixed(0)}% of expected)`);
console.log(`  stutters               ${median("stutters").toFixed(0)}`);
console.log(`  median frame           ${median("medianFrameMs").toFixed(1)} ms`);
console.log(`  p95 frame              ${median("p95FrameMs").toFixed(1)} ms`);
console.log(`  worst frame            ${median("worstFrameMs").toFixed(1)} ms`);
console.log(`  long tasks             ${median("longTaskCount").toFixed(0)} totalling ${median("longTaskMs").toFixed(0)} ms`);
console.log(
  `\nA smooth interaction sits at a ~${FRAME_BUDGET_MS.toFixed(1)} ms median with almost no missed frames — that is 60 fps,\n` +
    `not a problem to fix. What matters is p95 and worst: a high p95 over a healthy median is the\n` +
    `signature of periodic expensive work, in this app usually the O(n²) de-collision pipeline\n` +
    `recomputing because a memo dependency stopped being identity-stable.\n` +
    `Many missed frames across few stutters means one long stall; many stutters means steady\n` +
    `per-frame cost. See references/hot-spots.md, "Render and interaction cost".\n`
);

await browser.close();
