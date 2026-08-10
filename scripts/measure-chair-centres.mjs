#!/usr/bin/env node
// Measures the centre of each Northeast-pod chair pad in the shipped floor-plan
// render, and prints the fixture that tests/map-calibration.test.mjs asserts on.
//
// WHY THIS EXISTS: the original X fixture was produced by a scratch script that
// was never committed and is now gone, which left numbers in the test that
// nobody can re-derive (see that file's KNOWN GAP header — a 2026-07-21 sweep of
// 1082 parameter combinations of its described method never reproduced them
// closer than 0.84px mean / 2.15px worst case). This script exists so the Y
// fixture added alongside it does not repeat that mistake: run it, and you get
// the committed numbers back.
//
// USAGE: node scripts/measure-chair-centres.mjs [--json]
//
// METHOD, stated precisely enough to reproduce:
//   1. Read public/images/office-floor-plan.webp as raw RGB (3822x1734).
//   2. For each seat, take a search window around a coarse SEED (below).
//   3. Inside the window keep only "warm" pixels, red minus blue >= WARMTH_MIN.
//      The chair pads and desks are cream; the floor is blue-grey. WARMTH_MIN is
//      12 rather than 8 on purpose: the plan's white background is faintly warm
//      (red minus blue of 9) and is brighter than the pads, so a lower cut lets
//      the background win every luminance comparison below.
//   4. Take the largest 8-connected warm component. Where a pad sits on the
//      white background — the whole top row — that component IS the pad and no
//      luminance threshold is applied, which matters because thresholding a pad
//      against itself biases the centroid toward its brighter half.
//   5. Where the component comes back larger than a pad, the pad is touching a
//      warm desk (NE05 is the case that forced this). Split that component by
//      luminance using Otsu's method computed over its own pixels — the pads
//      read ~200-220 against a ~186-194 desk — and take the largest component
//      of the brighter side.
//   6. Report the centroid. A component touching the window edge, or outside the
//      expected pad size, is an error rather than a silently poor measurement.
//
// The SEEDS are search anchors only, never the answer: the window is +/-23px
// wide in master-plan pixels, so the measurement is free to land anywhere in
// that range, and a pad that moved further than the window makes this script
// fail loudly instead of quietly following the drift.

import sharp from "sharp";

const ASSET = "public/images/office-floor-plan.webp";

const WARMTH_MIN = 12;
// Master-plan pixels (1911x867); the shipped asset is a 2x upscale of it.
const PLAN_WIDTH_PX = 1911;
const PLAN_HEIGHT_PX = 867;
const WINDOW_HALF_X_PX = 23;
const WINDOW_HALF_Y_PX = 17;
const MIN_PAD_AREA = 400;
const MAX_PAD_AREA = 2200;
const MAX_SPLIT_PASSES = 4;
const MIN_PAD_SIDE_PX = 12;
const MAX_PAD_SIDE_PX = 30;

// Coarse anchors: the committed X fixture, and one Y per chair row. Both are
// only used to place the search window.
const SEEDS = {
  NE01: { x: 0.7320, y: 0.082 },
  NE02: { x: 0.7889, y: 0.082 },
  NE03: { x: 0.8187, y: 0.082 },
  NE04: { x: 0.8752, y: 0.082 },
  NE05: { x: 0.7303, y: 0.158 },
  NE06: { x: 0.7884, y: 0.158 },
  NE07: { x: 0.8197, y: 0.158 },
  NE08: { x: 0.8744, y: 0.158 }
};

function otsuThreshold(values) {
  const histogram = new Array(256).fill(0);
  for (const value of values) histogram[value]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = { variance: -1, threshold: 0 };
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > best.variance) best = { variance, threshold: t };
  }
  return best.threshold;
}

// Returns the largest 8-connected component of `mask`, including its own pixel
// mask so the caller can split just that component and iterate.
function largestComponent(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    const members = [];
    seen[start] = 1;
    let sumX = 0, sumY = 0, count = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    while (stack.length) {
      const index = stack.pop();
      members.push(index);
      const x = index % width;
      const y = (index - x) / width;
      sumX += x; sumY += y; count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbour = ny * width + nx;
          if (mask[neighbour] && !seen[neighbour]) {
            seen[neighbour] = 1;
            stack.push(neighbour);
          }
        }
      }
    }
    if (!best || count > best.count) {
      const pixels = new Uint8Array(mask.length);
      for (const index of members) pixels[index] = 1;
      best = { count, sumX, sumY, minX, maxX, minY, maxY, pixels };
    }
  }
  return best;
}

async function measure() {
  const { data, info } = await sharp(ASSET).raw().toBuffer({ resolveWithObject: true });
  const { width: imageWidth, height: imageHeight, channels } = info;
  // Window sizes are quoted in master-plan pixels; convert to asset pixels so
  // re-rendering the asset at a different scale does not change the method.
  const halfWindowX = Math.round((WINDOW_HALF_X_PX / PLAN_WIDTH_PX) * imageWidth);
  const halfWindowY = Math.round((WINDOW_HALF_Y_PX / PLAN_HEIGHT_PX) * imageHeight);

  const results = {};
  for (const [label, seed] of Object.entries(SEEDS)) {
    const centreX = Math.round(seed.x * imageWidth);
    const centreY = Math.round(seed.y * imageHeight);
    const x0 = centreX - halfWindowX;
    const y0 = centreY - halfWindowY;
    const windowWidth = halfWindowX * 2 + 1;
    const windowHeight = halfWindowY * 2 + 1;

    const luminance = new Uint8Array(windowWidth * windowHeight);
    const warm = new Uint8Array(windowWidth * windowHeight);
    const warmLuminance = [];
    for (let y = 0; y < windowHeight; y++) {
      for (let x = 0; x < windowWidth; x++) {
        const index = ((y0 + y) * imageWidth + (x0 + x)) * channels;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const value = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const position = y * windowWidth + x;
        luminance[position] = value;
        if (r - b >= WARMTH_MIN) {
          warm[position] = 1;
          warmLuminance.push(value);
        }
      }
    }

    if (warmLuminance.length < MIN_PAD_AREA) {
      throw new Error(`${label}: only ${warmLuminance.length} warm pixels in the search window — the artwork or the seed moved`);
    }

    let blob = largestComponent(warm, windowWidth, windowHeight);
    if (!blob) throw new Error(`${label}: no warm region found in the search window`);

    // Steps 4-5: split the warm region by luminance, and keep splitting while the
    // brightest part is still larger than a chair pad — one pass detaches a pad
    // from the desk it abuts, but NE05's pad needs two, because the desk beside
    // it is bright enough to survive the first cut. Where the region is already
    // pad-sized (a pad on the white background) the split is a no-op: Otsu lands
    // below the pad's own luminance range and removes nothing.
    let passes = 0;
    while (passes < MAX_SPLIT_PASSES) {
      const componentLuminance = [];
      for (let i = 0; i < blob.pixels.length; i++) if (blob.pixels[i]) componentLuminance.push(luminance[i]);
      const threshold = otsuThreshold(componentLuminance);
      const brighter = new Uint8Array(blob.pixels.length);
      for (let i = 0; i < brighter.length; i++) brighter[i] = blob.pixels[i] && luminance[i] > threshold ? 1 : 0;

      const split = largestComponent(brighter, windowWidth, windowHeight);
      if (!split) throw new Error(`${label}: no pad survived the luminance split at ${threshold}`);
      passes++;
      if (split.count === blob.count) break;
      blob = split;
      if (blob.count <= MAX_PAD_AREA) break;
    }
    if (blob.count > MAX_PAD_AREA) {
      throw new Error(`${label}: still ${blob.count}px after ${passes} luminance splits — the pad never separated from its surroundings`);
    }

    const padWidthPx = ((blob.maxX - blob.minX + 1) / imageWidth) * PLAN_WIDTH_PX;
    const padHeightPx = ((blob.maxY - blob.minY + 1) / imageHeight) * PLAN_HEIGHT_PX;
    if (blob.count < MIN_PAD_AREA || blob.count > MAX_PAD_AREA) {
      throw new Error(`${label}: pad area ${blob.count}px is outside [${MIN_PAD_AREA}, ${MAX_PAD_AREA}] — thresholding failed`);
    }
    if (padWidthPx < MIN_PAD_SIDE_PX || padWidthPx > MAX_PAD_SIDE_PX || padHeightPx < MIN_PAD_SIDE_PX || padHeightPx > MAX_PAD_SIDE_PX) {
      throw new Error(`${label}: pad measures ${padWidthPx.toFixed(1)}x${padHeightPx.toFixed(1)} master px, outside the expected pad size`);
    }
    if (blob.minX === 0 || blob.minY === 0 || blob.maxX === windowWidth - 1 || blob.maxY === windowHeight - 1) {
      throw new Error(`${label}: the pad touches the search-window edge, so its centre is clipped — widen the window and re-check the seed`);
    }

    results[label] = {
      x: Number(((x0 + blob.sumX / blob.count) / imageWidth).toFixed(4)),
      y: Number(((y0 + blob.sumY / blob.count) / imageHeight).toFixed(4)),
      areaPx: blob.count,
      padWidthPx: Number(padWidthPx.toFixed(1)),
      padHeightPx: Number(padHeightPx.toFixed(1))
    };
  }
  return results;
}

const results = await measure();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log("// Measured by scripts/measure-chair-centres.mjs — see its header for the method.");
  console.log("const CHAIR_CENTRE_Y = {");
  for (const [label, result] of Object.entries(results)) {
    console.log(`  ${label}: ${result.y.toFixed(4)},`);
  }
  console.log("};\n");
  console.log("Measured X (for comparison with the committed CHAIR_CENTRE_X fixture):");
  for (const [label, result] of Object.entries(results)) {
    console.log(`  ${label}: x=${result.x.toFixed(4)} y=${result.y.toFixed(4)} area=${result.areaPx} pad=${result.padWidthPx}x${result.padHeightPx} master px`);
  }
}
