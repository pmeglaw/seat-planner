/**
 * PROTOTYPE ONLY — pure math behind the /concepts/music-visualizer scene.
 *
 * Everything here is deliberately free of Web Audio, canvas and React so it can
 * run under `node --test` (tests/music-visualizer-math.test.mjs). The component
 * owns the AudioContext/AnalyserNode wiring and the canvas draw calls; this
 * module owns the signal analysis (band splitting, envelope following, beat
 * detection) and the scene geometry (perspective projection, ring radii, the
 * palette). Keeping the split here is what makes the feel tunable without a
 * browser in the loop.
 *
 * It lives beside the route rather than in lib/ on purpose: lib/ is the seat
 * planner's tested business core, and a visualizer is not part of it. Prototype
 * data/logic modules sit in their concept folder (see map-redesign/fixtureSeats
 * and seat-card/seatSheetData).
 */

/** Vertices per tunnel ring. Also the resolved spectrum width the scene draws. */
export const SPECTRUM_SEGMENTS = 96;

/** Perceptual band split (Hz). Bass drives the tunnel, treble the galaxy. */
export const BASS_RANGE_HZ: readonly [number, number] = [20, 160];
export const MID_RANGE_HZ: readonly [number, number] = [160, 2000];
export const TREBLE_RANGE_HZ: readonly [number, number] = [2000, 12000];

/** Spectrum window the ring geometry samples — below 30Hz is rumble, above 16k is hiss. */
export const SPECTRUM_MIN_HZ = 30;
export const SPECTRUM_MAX_HZ = 16000;

export type Levels = {
  bass: number;
  mid: number;
  treble: number;
  /** Broadband loudness across the full analysed spectrum. */
  overall: number;
};

export type BandRange = { start: number; end: number };

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Centre frequency of an FFT bin. */
export function binToHz(bin: number, sampleRate: number, fftSize: number): number {
  return (bin * sampleRate) / fftSize;
}

/** Nearest FFT bin for a frequency, clamped into the analyser's bin array. */
export function hzToBin(hz: number, sampleRate: number, fftSize: number): number {
  const binCount = fftSize / 2;
  const bin = Math.round((hz * fftSize) / sampleRate);
  return clamp(bin, 0, binCount - 1);
}

/**
 * Log-spaced bin ranges — one per visual segment. Linear bins would give the
 * bottom two octaves a single band and the top octave forty, which is why a
 * naive bar-graph visualizer looks dead on the left and noisy on the right.
 * Every range is at least one bin wide so no segment reads as permanent silence.
 */
export function logBandRanges(
  bandCount: number,
  sampleRate: number,
  fftSize: number,
  minHz: number = SPECTRUM_MIN_HZ,
  maxHz: number = SPECTRUM_MAX_HZ
): BandRange[] {
  const binCount = fftSize / 2;
  const nyquist = sampleRate / 2;
  const top = Math.min(maxHz, nyquist);
  const ratio = top / minHz;
  const ranges: BandRange[] = [];
  for (let i = 0; i < bandCount; i += 1) {
    const lowHz = minHz * ratio ** (i / bandCount);
    const highHz = minHz * ratio ** ((i + 1) / bandCount);
    const start = clamp(Math.floor((lowHz / nyquist) * binCount), 0, binCount - 1);
    const end = clamp(Math.ceil((highHz / nyquist) * binCount), start + 1, binCount);
    ranges.push({ start, end });
  }
  return ranges;
}

/**
 * Mean byte magnitude per band, normalised to 0..1. `out` is reused across
 * frames — this runs 60x a second and must not allocate.
 */
export function bandMagnitudes(
  frequencies: ArrayLike<number>,
  ranges: readonly BandRange[],
  out: Float32Array = new Float32Array(ranges.length)
): Float32Array {
  for (let i = 0; i < ranges.length; i += 1) {
    const { start, end } = ranges[i];
    let sum = 0;
    let count = 0;
    for (let bin = start; bin < end && bin < frequencies.length; bin += 1) {
      sum += frequencies[bin];
      count += 1;
    }
    out[i] = count === 0 ? 0 : clamp01(sum / count / 255);
  }
  return out;
}

/** Mean normalised magnitude between two frequencies. */
export function rangeLevel(
  frequencies: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  lowHz: number,
  highHz: number
): number {
  const start = hzToBin(lowHz, sampleRate, fftSize);
  const end = Math.max(start + 1, hzToBin(highHz, sampleRate, fftSize));
  let sum = 0;
  let count = 0;
  for (let bin = start; bin <= end && bin < frequencies.length; bin += 1) {
    sum += frequencies[bin];
    count += 1;
  }
  return count === 0 ? 0 : clamp01(sum / count / 255);
}

/** Bass/mid/treble split plus broadband loudness, all 0..1. */
export function spectrumLevels(frequencies: ArrayLike<number>, sampleRate: number, fftSize: number): Levels {
  return {
    bass: rangeLevel(frequencies, sampleRate, fftSize, BASS_RANGE_HZ[0], BASS_RANGE_HZ[1]),
    mid: rangeLevel(frequencies, sampleRate, fftSize, MID_RANGE_HZ[0], MID_RANGE_HZ[1]),
    treble: rangeLevel(frequencies, sampleRate, fftSize, TREBLE_RANGE_HZ[0], TREBLE_RANGE_HZ[1]),
    overall: rangeLevel(frequencies, sampleRate, fftSize, SPECTRUM_MIN_HZ, SPECTRUM_MAX_HZ)
  };
}

/** RMS of time-domain byte data, where 128 is silence. Returns 0..1. */
export function waveformRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centred = (samples[i] - 128) / 128;
    sum += centred * centred;
  }
  return clamp01(Math.sqrt(sum / samples.length));
}

/**
 * Sensitivity curve. A plain multiply clips everything flat the moment a track
 * gets loud, so gain is followed by a soft knee: the top of the range compresses
 * asymptotically toward 1 instead of hitting a wall.
 */
export function applySensitivity(value: number, sensitivity: number): number {
  const gained = clamp01(value) * Math.max(0, sensitivity);
  return gained <= 0 ? 0 : 1 - Math.exp(-gained * 1.45);
}

/**
 * Asymmetric envelope follower, frame-rate independent (the alpha is derived
 * from elapsed time, not assumed 60fps). Rising fast and falling slow is what
 * makes a peak read as a hit rather than a flicker.
 */
export function smoothTowards(
  current: number,
  target: number,
  dtMs: number,
  attackMs: number,
  releaseMs: number
): number {
  const tau = target > current ? attackMs : releaseMs;
  if (tau <= 0) return target;
  if (dtMs <= 0) return current;
  const alpha = 1 - Math.exp(-dtMs / tau);
  return current + (target - current) * alpha;
}

/** In-place `smoothTowards` across a whole spectrum. */
export function smoothSpectrum(
  current: Float32Array,
  target: ArrayLike<number>,
  dtMs: number,
  attackMs: number,
  releaseMs: number
): Float32Array {
  for (let i = 0; i < current.length; i += 1) {
    current[i] = smoothTowards(current[i], i < target.length ? target[i] : 0, dtMs, attackMs, releaseMs);
  }
  return current;
}

export type BeatDetectorOptions = {
  /** Samples of history the adaptive threshold averages over. */
  historySize?: number;
  /** Standard deviations above the rolling mean that count as an onset. */
  threshold?: number;
  /** Absolute floor, so hiss in a quiet passage never registers. */
  floor?: number;
  /** Minimum rise over the threshold. Guards the zero-variance case, where a
   *  perfectly steady signal would otherwise clear the mean on every sample. */
  margin?: number;
  /** Minimum gap between reported beats. */
  refractoryMs?: number;
};

export type BeatDetector = {
  /** Feeds one bass-energy sample; true when this sample is an onset. */
  push(energy: number, nowMs: number): boolean;
  reset(): void;
};

/**
 * Adaptive onset detection: an energy spike counts as a beat only when it
 * clears the recent rolling mean by `threshold` standard deviations. A fixed
 * cutoff would fire constantly in a loud master and never in a quiet one; the
 * variance term is what makes it track the material.
 */
export function createBeatDetector(options: BeatDetectorOptions = {}): BeatDetector {
  const historySize = options.historySize ?? 48;
  const threshold = options.threshold ?? 1.5;
  const floor = options.floor ?? 0.08;
  const margin = options.margin ?? 0.02;
  const refractoryMs = options.refractoryMs ?? 190;

  let history = new Float32Array(historySize);
  let filled = 0;
  let cursor = 0;
  let lastBeatMs = Number.NEGATIVE_INFINITY;

  return {
    push(energy, nowMs) {
      const sample = clamp01(energy);
      let mean = 0;
      for (let i = 0; i < filled; i += 1) mean += history[i];
      mean = filled === 0 ? 0 : mean / filled;

      let variance = 0;
      for (let i = 0; i < filled; i += 1) variance += (history[i] - mean) ** 2;
      variance = filled === 0 ? 0 : variance / filled;

      history[cursor] = sample;
      cursor = (cursor + 1) % historySize;
      filled = Math.min(filled + 1, historySize);

      // Needs a full window before it can claim anything about "recent".
      if (filled < historySize) return false;
      if (sample < floor) return false;
      if (nowMs - lastBeatMs < refractoryMs) return false;
      if (sample < mean + threshold * Math.sqrt(variance) + margin) return false;

      lastBeatMs = nowMs;
      return true;
    },
    reset() {
      history = new Float32Array(historySize);
      filled = 0;
      cursor = 0;
      lastBeatMs = Number.NEGATIVE_INFINITY;
    }
  };
}

/**
 * Per-frame alpha of the background wash that produces the motion trail.
 * 1 wipes the frame clean (trail 0); the curve bottoms out at 0.02 rather than
 * 0 so a maxed trail still decays instead of burning in permanently.
 */
export function trailAlpha(trail: number): number {
  const t = clamp01(trail);
  return clamp((1 - t) ** 2 * 0.98 + 0.02, 0.02, 1);
}

/**
 * Pinhole projection: on-screen scale of geometry at depth `z`. `z` counts
 * away from the camera, so 0 is at the lens and larger is further into the
 * tunnel. Never returns a negative scale — rings behind the camera are culled
 * by the caller, not mirrored.
 */
export function projectScale(z: number, focal: number): number {
  return focal / Math.max(focal + z, 1e-3);
}

/** Radius of one ring vertex: base circle, bulged by that band's magnitude. */
export function ringPointRadius(baseRadius: number, magnitude: number, bulge: number, scale: number): number {
  return baseRadius * (1 + clamp01(magnitude) * bulge) * scale;
}

/**
 * Ring twist by depth. Distant rings lag the near ones, so a sustained spin
 * reads as a corkscrew running down the tunnel rather than a flat turntable.
 */
export function ringTwist(z: number, elapsedMs: number, spin: number): number {
  return (elapsedMs / 1000) * spin * 0.42 + z * spin * 0.06;
}

/**
 * Scene hue in degrees. Drifts slowly on its own so a static pad still moves,
 * and shifts warm as treble climbs — bright material reads hot, bass-heavy
 * material stays in the blues.
 */
export function sceneHue(baseHue: number, levels: Levels, elapsedMs: number): number {
  const drift = (elapsedMs / 1000) * 2.2;
  const tilt = (levels.treble - levels.bass) * 38;
  return ((baseHue + drift + tilt) % 360 + 360) % 360;
}

export function hsla(hue: number, saturation: number, lightness: number, alpha: number): string {
  const h = ((hue % 360) + 360) % 360;
  return `hsla(${h.toFixed(1)}, ${clamp(saturation, 0, 100).toFixed(1)}%, ${clamp(lightness, 0, 100).toFixed(1)}%, ${clamp01(alpha).toFixed(3)})`;
}

export type SceneParams = {
  sensitivity: number;
  trail: number;
  bloom: number;
  zoom: number;
  spin: number;
};

export const DEFAULT_SCENE_PARAMS: SceneParams = {
  sensitivity: 1,
  trail: 0.7,
  bloom: 1,
  zoom: 1,
  spin: 1
};

export const SCENE_PARAM_RANGES: Record<keyof SceneParams, { min: number; max: number; step: number }> = {
  sensitivity: { min: 0.2, max: 3, step: 0.05 },
  trail: { min: 0, max: 0.95, step: 0.01 },
  bloom: { min: 0, max: 2, step: 0.05 },
  zoom: { min: 0.5, max: 2, step: 0.05 },
  spin: { min: -2, max: 2, step: 0.05 }
};

export function clampSceneParams(params: SceneParams): SceneParams {
  const out = {} as SceneParams;
  for (const key of Object.keys(SCENE_PARAM_RANGES) as (keyof SceneParams)[]) {
    const { min, max } = SCENE_PARAM_RANGES[key];
    out[key] = clamp(params[key], min, max);
  }
  return out;
}

/**
 * prefers-reduced-motion variant. The scene stays legible and still reacts to
 * the music, but the two things that actually cause discomfort — sustained
 * rotation and depth rush — are cut, and the trail is shortened so the frame
 * settles instead of smearing.
 */
export function reducedMotionParams(params: SceneParams): SceneParams {
  return clampSceneParams({
    ...params,
    spin: 0,
    zoom: clamp(params.zoom, 0.5, 1),
    trail: Math.min(params.trail, 0.35)
  });
}
