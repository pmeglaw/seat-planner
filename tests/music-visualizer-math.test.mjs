import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// The prototype's analysis + geometry core. It lives beside its route rather
// than in lib/ (a visualizer is not seat-planner business logic), but the
// numeric behaviour is exactly the kind that rots silently, so it is tested
// like anything else: run the real TypeScript, assert on the output.
const math = await importTsModule("app/concepts/music-visualizer/visualizerMath.ts");

const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;

/** Byte spectrum with `value` in every bin between lowHz and highHz. */
function spectrumBetween(lowHz, highHz, value) {
  const bins = new Uint8Array(FFT_SIZE / 2);
  const start = math.hzToBin(lowHz, SAMPLE_RATE, FFT_SIZE);
  const end = math.hzToBin(highHz, SAMPLE_RATE, FFT_SIZE);
  for (let bin = start; bin <= end; bin += 1) bins[bin] = value;
  return bins;
}

test("clamp pins to the range and treats NaN as the low end", () => {
  assert.equal(math.clamp(5, 0, 10), 5);
  assert.equal(math.clamp(-3, 0, 10), 0);
  assert.equal(math.clamp(42, 0, 10), 10);
  // A NaN leaking into a canvas coordinate silently blanks the whole frame,
  // so it resolves to the floor rather than propagating.
  assert.equal(math.clamp(Number.NaN, 2, 10), 2);
  assert.equal(math.clamp01(1.4), 1);
  assert.equal(math.clamp01(-0.2), 0);
  assert.equal(math.lerp(10, 20, 0.25), 12.5);
});

test("bin/Hz conversion round-trips and stays inside the analyser's bin array", () => {
  const binCount = FFT_SIZE / 2;
  for (const hz of [50, 440, 1000, 8000]) {
    const bin = math.hzToBin(hz, SAMPLE_RATE, FFT_SIZE);
    assert.ok(Math.abs(math.binToHz(bin, SAMPLE_RATE, FFT_SIZE) - hz) < SAMPLE_RATE / FFT_SIZE);
  }
  assert.equal(math.hzToBin(-100, SAMPLE_RATE, FFT_SIZE), 0);
  assert.equal(math.hzToBin(999999, SAMPLE_RATE, FFT_SIZE), binCount - 1);
});

test("logBandRanges covers the spectrum with widening, never-empty bands", () => {
  const ranges = math.logBandRanges(96, SAMPLE_RATE, FFT_SIZE);
  assert.equal(ranges.length, 96);
  for (const range of ranges) {
    assert.ok(range.end > range.start, "every band must own at least one bin");
    assert.ok(range.start >= 0 && range.end <= FFT_SIZE / 2);
  }
  // Log spacing is the whole point: the top band must span far more bins than
  // the bottom one, or the low octaves collapse into a single bar.
  const first = ranges[0].end - ranges[0].start;
  const last = ranges[ranges.length - 1].end - ranges[ranges.length - 1].start;
  assert.ok(last > first * 5, `expected widening bands, got ${first} then ${last}`);
  // Bands march upward.
  for (let i = 1; i < ranges.length; i += 1) {
    assert.ok(ranges[i].start >= ranges[i - 1].start);
  }
});

test("bandMagnitudes averages each band into 0..1 and reuses the output buffer", () => {
  const ranges = [
    { start: 0, end: 2 },
    { start: 2, end: 4 },
    { start: 4, end: 6 }
  ];
  const bins = Uint8Array.from([255, 255, 0, 0, 128, 0]);
  const out = new Float32Array(3);
  const result = math.bandMagnitudes(bins, ranges, out);
  assert.equal(result, out, "must write into the buffer it was handed — this runs 60x a second");
  assert.equal(out[0], 1);
  assert.equal(out[1], 0);
  assert.ok(Math.abs(out[2] - 64 / 255) < 1e-6);
});

test("bandMagnitudes yields 0 for ranges past the end of the data", () => {
  const out = math.bandMagnitudes(Uint8Array.from([255, 255]), [{ start: 8, end: 12 }]);
  assert.equal(out[0], 0);
});

test("spectrumLevels separates bass, mid and treble", () => {
  const bassOnly = math.spectrumLevels(spectrumBetween(30, 140, 255), SAMPLE_RATE, FFT_SIZE);
  assert.ok(bassOnly.bass > 0.85, `bass ${bassOnly.bass}`);
  assert.ok(bassOnly.treble < 0.05, `treble ${bassOnly.treble}`);

  const trebleOnly = math.spectrumLevels(spectrumBetween(4000, 11000, 255), SAMPLE_RATE, FFT_SIZE);
  assert.ok(trebleOnly.treble > 0.5, `treble ${trebleOnly.treble}`);
  assert.ok(trebleOnly.bass < 0.05, `bass ${trebleOnly.bass}`);

  const silent = math.spectrumLevels(new Uint8Array(FFT_SIZE / 2), SAMPLE_RATE, FFT_SIZE);
  assert.deepEqual(silent, { bass: 0, mid: 0, treble: 0, overall: 0 });
});

test("waveformRms reads byte time-domain data around the 128 midpoint", () => {
  assert.equal(math.waveformRms([]), 0);
  // 128 is silence in getByteTimeDomainData, not 0.
  assert.equal(math.waveformRms(new Uint8Array(64).fill(128)), 0);
  const square = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 0 : 255));
  assert.ok(math.waveformRms(square) > 0.99);
});

test("applySensitivity is monotonic, saturating, and pinned at zero", () => {
  assert.equal(math.applySensitivity(0, 2), 0);
  const low = math.applySensitivity(0.4, 1);
  const high = math.applySensitivity(0.4, 2.5);
  assert.ok(high > low, "more sensitivity must mean more response");
  // The soft knee is what stops a loud master pinning every band flat at 1.
  assert.ok(math.applySensitivity(1, 3) < 1);
  let previous = -1;
  for (let v = 0; v <= 1.0001; v += 0.1) {
    const current = math.applySensitivity(v, 1.5);
    assert.ok(current >= previous, "must not fold back on itself");
    previous = current;
  }
});

test("smoothTowards attacks faster than it releases", () => {
  const rising = math.smoothTowards(0, 1, 16, 40, 400);
  const falling = 1 - math.smoothTowards(1, 0, 16, 40, 400);
  assert.ok(rising > falling, `attack ${rising} should outrun release ${falling}`);
});

test("smoothTowards is frame-rate independent", () => {
  // Two 8ms steps must land where one 16ms step lands, or the scene changes
  // character between a 60Hz and a 120Hz display.
  const oneStep = math.smoothTowards(0, 1, 16, 50, 50);
  const halfStep = math.smoothTowards(math.smoothTowards(0, 1, 8, 50, 50), 1, 8, 50, 50);
  assert.ok(Math.abs(oneStep - halfStep) < 1e-9, `${oneStep} vs ${halfStep}`);
});

test("smoothTowards handles zero time constants and zero elapsed time", () => {
  assert.equal(math.smoothTowards(0, 1, 16, 0, 100), 1, "no attack time means land immediately");
  assert.equal(math.smoothTowards(0.5, 1, 0, 50, 50), 0.5, "no elapsed time means no movement");
});

test("smoothSpectrum updates in place and treats a short target as silence", () => {
  const current = Float32Array.from([1, 1, 1]);
  const result = math.smoothSpectrum(current, [0, 0], 1000, 10, 10);
  assert.equal(result, current);
  assert.ok(current[0] < 0.01);
  assert.ok(current[2] < 0.01, "band with no target must decay toward zero, not freeze");
});

test("createBeatDetector waits for a full history window before firing", () => {
  const detector = math.createBeatDetector({ historySize: 8, refractoryMs: 0 });
  let now = 0;
  for (let i = 0; i < 7; i += 1) {
    assert.equal(detector.push(0.9, (now += 10)), false, "cannot judge 'recent' without a window");
  }
});

test("createBeatDetector fires on a spike above the rolling mean", () => {
  const detector = math.createBeatDetector({ historySize: 8, refractoryMs: 100 });
  let now = 0;
  // Fill with a quiet, slightly varying floor.
  for (let i = 0; i < 8; i += 1) detector.push(0.1 + (i % 2) * 0.01, (now += 10));
  assert.equal(detector.push(0.9, (now += 10)), true, "a clear transient is a beat");
  // Refractory: a second spike inside the window is the same hit, not a new one.
  assert.equal(detector.push(0.95, (now += 10)), false);
  assert.equal(detector.push(0.95, (now += 200)), true, "past the refractory it can fire again");
});

test("createBeatDetector ignores quiet passages and steady tones", () => {
  const quiet = math.createBeatDetector({ historySize: 6, floor: 0.3, refractoryMs: 0 });
  let now = 0;
  for (let i = 0; i < 6; i += 1) quiet.push(0.001, (now += 10));
  assert.equal(quiet.push(0.05, (now += 10)), false, "below the floor is noise, not a beat");

  // Zero variance collapses the adaptive threshold onto the mean; the margin is
  // what stops a held organ chord strobing on every frame.
  const steady = math.createBeatDetector({ historySize: 6, floor: 0, refractoryMs: 0 });
  for (let i = 0; i < 6; i += 1) steady.push(0.5, (now += 10));
  assert.equal(steady.push(0.5, (now += 10)), false);
});

test("createBeatDetector reset clears history and the refractory clock", () => {
  const detector = math.createBeatDetector({ historySize: 4, refractoryMs: 0 });
  let now = 0;
  for (let i = 0; i < 4; i += 1) detector.push(0.1 + (i % 2) * 0.01, (now += 10));
  assert.equal(detector.push(0.9, (now += 10)), true);
  detector.reset();
  assert.equal(detector.push(0.9, (now += 10)), false, "after reset the window is empty again");
});

test("trailAlpha spans a full wipe to a slow decay and never reaches zero", () => {
  assert.equal(math.trailAlpha(0), 1, "no trail must clear the frame outright");
  assert.ok(math.trailAlpha(1) >= 0.02, "a maxed trail must still decay or the frame burns in");
  assert.ok(math.trailAlpha(1) <= 0.02);
  let previous = Number.POSITIVE_INFINITY;
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const alpha = math.trailAlpha(t);
    assert.ok(alpha <= previous, "more trail must always mean a gentler wash");
    previous = alpha;
  }
});

test("projectScale shrinks with depth and stays finite at the lens", () => {
  const focal = 420;
  assert.equal(math.projectScale(0, focal), 1);
  assert.ok(math.projectScale(900, focal) < math.projectScale(300, focal));
  assert.ok(math.projectScale(300, focal) < 1);
  // Geometry that has passed the camera must not flip to a negative scale.
  assert.ok(math.projectScale(-focal, focal) > 0);
  assert.ok(Number.isFinite(math.projectScale(-focal, focal)));
});

test("ringPointRadius bulges the base circle by band magnitude", () => {
  assert.equal(math.ringPointRadius(100, 0, 0.5, 1), 100);
  assert.equal(math.ringPointRadius(100, 1, 0.5, 1), 150);
  assert.equal(math.ringPointRadius(100, 1, 0.5, 0.5), 75, "scale applies after the bulge");
});

test("ringTwist advances with time, depth and spin, and is flat when spin is zero", () => {
  assert.equal(math.ringTwist(500, 4000, 0), 0);
  assert.ok(math.ringTwist(0, 2000, 1) > math.ringTwist(0, 1000, 1));
  assert.ok(math.ringTwist(600, 1000, 1) > math.ringTwist(0, 1000, 1), "distant rings must lag");
  assert.ok(math.ringTwist(0, 1000, -1) < 0, "negative spin reverses");
});

test("sceneHue stays a valid hue and leans warm on treble, cool on bass", () => {
  const levels = t => ({ bass: 1 - t, mid: 0.2, treble: t, overall: 0.4 });
  for (const elapsed of [0, 12_345, 900_000]) {
    const hue = math.sceneHue(212, levels(0.5), elapsed);
    assert.ok(hue >= 0 && hue < 360, `hue ${hue} out of range`);
  }
  const bright = math.sceneHue(212, levels(1), 0);
  const dark = math.sceneHue(212, levels(0), 0);
  assert.ok(bright > dark, "treble-heavy material should shift the palette");
});

test("hsla emits a valid colour and clamps its channels", () => {
  assert.equal(math.hsla(180, 50, 50, 0.5), "hsla(180.0, 50.0%, 50.0%, 0.500)");
  assert.equal(math.hsla(-30, 50, 50, 0.5), "hsla(330.0, 50.0%, 50.0%, 0.500)", "hue wraps");
  assert.equal(math.hsla(420, 50, 50, 0.5), "hsla(60.0, 50.0%, 50.0%, 0.500)");
  assert.equal(math.hsla(0, 300, -20, 5), "hsla(0.0, 100.0%, 0.0%, 1.000)");
});

test("the default scene params sit inside their own declared ranges", () => {
  for (const [key, range] of Object.entries(math.SCENE_PARAM_RANGES)) {
    const value = math.DEFAULT_SCENE_PARAMS[key];
    assert.ok(value >= range.min && value <= range.max, `${key}=${value} outside ${range.min}..${range.max}`);
  }
  assert.deepEqual(math.clampSceneParams(math.DEFAULT_SCENE_PARAMS), math.DEFAULT_SCENE_PARAMS);
});

test("clampSceneParams pulls every out-of-range value back", () => {
  const clamped = math.clampSceneParams({ sensitivity: 99, trail: -5, bloom: 99, zoom: -1, spin: 99 });
  for (const [key, range] of Object.entries(math.SCENE_PARAM_RANGES)) {
    assert.ok(clamped[key] >= range.min && clamped[key] <= range.max, `${key}=${clamped[key]}`);
  }
});

test("reducedMotionParams removes rotation and depth rush but keeps the scene reactive", () => {
  const reduced = math.reducedMotionParams({ sensitivity: 1.5, trail: 0.95, bloom: 1.4, zoom: 2, spin: -2 });
  assert.equal(reduced.spin, 0, "sustained rotation is the part that causes discomfort");
  assert.ok(reduced.zoom <= 1, "no depth rush");
  assert.ok(reduced.trail <= 0.35, "the frame must settle rather than smear");
  // Sensitivity and bloom are not motion, so the scene still answers the music.
  assert.equal(reduced.sensitivity, 1.5);
  assert.equal(reduced.bloom, 1.4);
});

test("SPECTRUM_SEGMENTS is the shared width of every per-band buffer", () => {
  assert.equal(typeof math.SPECTRUM_SEGMENTS, "number");
  assert.ok(math.SPECTRUM_SEGMENTS >= 32);
  assert.equal(math.logBandRanges(math.SPECTRUM_SEGMENTS, SAMPLE_RATE, FFT_SIZE).length, math.SPECTRUM_SEGMENTS);
});
