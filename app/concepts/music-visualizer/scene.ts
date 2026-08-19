/**
 * PROTOTYPE ONLY — canvas renderer for /concepts/music-visualizer.
 *
 * THREE CANVASES, and the split is load-bearing:
 *
 *   scene   (offscreen, full res) — the motion trail lives here. Instead of
 *           clearing, each frame washes the buffer with a partly-transparent
 *           background, so older frames decay in place.
 *   bright  (offscreen, quarter res) — a cheap bright-pass. Downscale the
 *           scene, then multiply it by itself: squaring each channel crushes
 *           the dim areas and keeps the highlights, which is what should bloom.
 *           A real luminance threshold means touching pixels, which is far too
 *           slow at 60fps.
 *   display (visible) — scene composited with the blurred bright-pass added on
 *           top.
 *
 * Compositing the bloom onto the *scene* canvas instead would feed it back into
 * the trail buffer, and the frame blows out to white within a second or two.
 * That is the entire reason the visible canvas is not the one being drawn into.
 *
 * All geometry maths is imported from visualizerMath.ts so it stays unit
 * testable; this file owns only the draw calls.
 */

import {
  SPECTRUM_SEGMENTS,
  clamp,
  clamp01,
  hsla,
  projectScale,
  ringPointRadius,
  ringTwist,
  sceneHue,
  trailAlpha,
  type Levels,
  type SceneParams
} from "./visualizerMath";

/** Depth of the far plane where rings and stars are born. */
const FAR_Z = 900;
/** Camera focal length — larger flattens the perspective, smaller exaggerates it. */
const FOCAL = 420;
/** Distance behind the lens at which geometry is retired. */
const CULL_Z = -30;
/** Depth gap between consecutive tunnel rings. */
const RING_SPACING = 46;
const MAX_RINGS = 44;
const STAR_COUNT = 320;
/** Palette anchor — everything else is a drift/tilt off this hue. */
const BASE_HUE = 212;

type Ring = {
  z: number;
  /** Spectrum snapshot taken when the ring was born — the tunnel is the music's recent past. */
  magnitudes: Float32Array;
  hue: number;
  energy: number;
};

type Star = {
  angle: number;
  /** Orbital radius as a fraction of the viewport's short side. */
  orbit: number;
  z: number;
  size: number;
  drift: number;
  seed: number;
};

export type FrameInput = {
  /** Smoothed, sensitivity-shaped band magnitudes, length SPECTRUM_SEGMENTS. */
  spectrum: Float32Array;
  /** Smoothed time-domain samples in -1..1, length SPECTRUM_SEGMENTS. */
  waveform: Float32Array;
  levels: Levels;
  /** Decaying 0..1 flash set to 1 on each detected onset. */
  beat: number;
  params: SceneParams;
  elapsedMs: number;
  dtMs: number;
};

export type Scene = {
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  render(frame: FrameInput): void;
  dispose(): void;
};

type Layer = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

function createLayer(): Layer | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

/**
 * All four drawing contexts, or null if any is unavailable. Resolving them
 * together — and destructuring the result after the guard — is what lets the
 * draw functions below treat them as non-null: TypeScript does not carry a
 * narrowing into a hoisted function declaration, so checking each one in
 * createScene would leave every ctx optional at every call site.
 */
function createLayers(displayCanvas: HTMLCanvasElement):
  | { displayCtx: CanvasRenderingContext2D; scene: Layer; bright: Layer; blur: Layer }
  | null {
  const displayCtx = displayCanvas.getContext("2d");
  const scene = createLayer();
  const bright = createLayer();
  const blur = createLayer();
  if (!displayCtx || !scene || !bright || !blur) return null;
  return { displayCtx, scene, bright, blur };
}

/** Deterministic-ish scatter with a bias toward the outer disc, like a galaxy. */
function seedStar(z: number): Star {
  return {
    angle: Math.random() * Math.PI * 2,
    orbit: 0.08 + Math.sqrt(Math.random()) * 0.62,
    z,
    size: 0.6 + Math.random() * 2.1,
    drift: 0.55 + Math.random() * 0.9,
    seed: Math.random() * Math.PI * 2
  };
}

export function createScene(displayCanvas: HTMLCanvasElement): Scene | null {
  const layers = createLayers(displayCanvas);
  if (!layers) return null;
  const { displayCtx, scene: sceneLayer, bright: brightLayer, blur: blurLayer } = layers;

  // Safari only shipped ctx.filter in 16.4; without it the bloom still works,
  // it is just softened by the upscale rather than a real blur.
  const supportsFilter = typeof sceneLayer.ctx.filter === "string";

  let width = 0;
  let height = 0;
  let bloomWidth = 0;
  let bloomHeight = 0;

  const rings: Ring[] = [];
  const stars: Star[] = Array.from({ length: STAR_COUNT }, () => seedStar(Math.random() * FAR_Z));
  let spawnAccumulator = RING_SPACING;

  function resize(cssWidth: number, cssHeight: number, dpr: number): void {
    width = Math.max(1, Math.floor(cssWidth * dpr));
    height = Math.max(1, Math.floor(cssHeight * dpr));
    bloomWidth = Math.max(1, Math.floor(width / 4));
    bloomHeight = Math.max(1, Math.floor(height / 4));

    for (const canvas of [displayCanvas, sceneLayer.canvas]) {
      canvas.width = width;
      canvas.height = height;
    }
    for (const canvas of [brightLayer.canvas, blurLayer.canvas]) {
      canvas.width = bloomWidth;
      canvas.height = bloomHeight;
    }
    displayCanvas.style.width = `${cssWidth}px`;
    displayCanvas.style.height = `${cssHeight}px`;

    // A resize resets the backing store to transparent; repaint the ground so
    // the first trail wash has something to fade toward.
    sceneLayer.ctx.fillStyle = "#04060d";
    sceneLayer.ctx.fillRect(0, 0, width, height);
  }

  function drawNebula(hue: number, levels: Levels, elapsedMs: number): void {
    const ctx = sceneLayer.ctx;
    const t = elapsedMs / 1000;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const blobs = [
      { hue, phase: 0, spread: 0.55, weight: 0.5 + levels.bass * 0.8 },
      { hue: hue + 58, phase: 2.1, spread: 0.42, weight: 0.35 + levels.mid * 0.7 },
      { hue: hue - 42, phase: 4.3, spread: 0.34, weight: 0.3 + levels.treble * 0.6 }
    ];
    for (const blob of blobs) {
      const x = width * (0.5 + Math.cos(t * 0.11 + blob.phase) * 0.22);
      const y = height * (0.5 + Math.sin(t * 0.083 + blob.phase) * 0.2);
      const radius = Math.min(width, height) * blob.spread;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, hsla(blob.hue, 88, 58, 0.05 * blob.weight));
      gradient.addColorStop(0.55, hsla(blob.hue, 84, 44, 0.018 * blob.weight));
      gradient.addColorStop(1, hsla(blob.hue, 80, 30, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function drawStars(hue: number, frame: FrameInput, travel: number): void {
    const ctx = sceneLayer.ctx;
    const { levels, params, elapsedMs, dtMs } = frame;
    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const star of stars) {
      star.z -= travel * star.drift;
      star.angle += (params.spin * dtMs) / 1000 * 0.12 * (1.25 - star.orbit);
      if (star.z < CULL_Z) {
        const respawned = seedStar(FAR_Z);
        star.angle = respawned.angle;
        star.orbit = respawned.orbit;
        star.z = FAR_Z;
        star.size = respawned.size;
        star.drift = respawned.drift;
        star.seed = respawned.seed;
      }
      const scale = projectScale(star.z, FOCAL) * params.zoom;
      // The disc is squashed vertically so the field reads as a galaxy seen at
      // a shallow angle rather than a sphere of dots.
      const radius = star.orbit * minDim * scale * (1 + levels.mid * 0.3);
      const x = cx + Math.cos(star.angle) * radius;
      const y = cy + Math.sin(star.angle) * radius * 0.58;
      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) continue;

      const twinkle = 0.55 + 0.45 * Math.sin(elapsedMs * 0.0032 + star.seed);
      const depth = clamp01(1 - star.z / FAR_Z);
      const alpha = clamp01(depth * twinkle * (0.28 + levels.treble * 0.85));
      const size = clamp(star.size * scale * (1 + levels.treble * 1.4), 0.3, 9);
      ctx.fillStyle = hsla(hue + star.seed * 12, 92, 78, alpha);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Closed Catmull-Rom-ish curve through the ring vertices, drawn as quadratics
   * between consecutive midpoints. Straight line segments make the ring read as
   * a spiky polygon; this keeps it a ribbon.
   */
  /** Vertices per ring: the spectrum mirrored across the vertical axis. */
  const RING_VERTICES = SPECTRUM_SEGMENTS * 2;

  /** Band feeding vertex `i` — up one side of the ring and back down the other. */
  function mirroredBand(vertex: number): number {
    return vertex < SPECTRUM_SEGMENTS ? vertex : RING_VERTICES - 1 - vertex;
  }

  function traceRing(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseRadius: number,
    magnitudes: Float32Array,
    bulge: number,
    scale: number,
    twist: number
  ): void {
    const points: number[] = [];
    for (let i = 0; i < RING_VERTICES; i += 1) {
      const angle = (i / RING_VERTICES) * Math.PI * 2 + twist;
      const radius = ringPointRadius(baseRadius, magnitudes[mirroredBand(i)], bulge, scale);
      points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    }
    ctx.beginPath();
    const lastX = points[(RING_VERTICES - 1) * 2];
    const lastY = points[(RING_VERTICES - 1) * 2 + 1];
    ctx.moveTo((lastX + points[0]) / 2, (lastY + points[1]) / 2);
    for (let i = 0; i < RING_VERTICES; i += 1) {
      const cxi = points[i * 2];
      const cyi = points[i * 2 + 1];
      const nextIndex = (i + 1) % RING_VERTICES;
      const nx = points[nextIndex * 2];
      const ny = points[nextIndex * 2 + 1];
      ctx.quadraticCurveTo(cxi, cyi, (cxi + nx) / 2, (cyi + ny) / 2);
    }
    ctx.closePath();
  }

  function drawTunnel(hue: number, frame: FrameInput, travel: number): void {
    const ctx = sceneLayer.ctx;
    const { spectrum, levels, params, elapsedMs } = frame;
    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const baseRadius = minDim * 0.4;

    for (const ring of rings) ring.z -= travel;
    while (rings.length > 0 && rings[0].z < CULL_Z) rings.shift();

    spawnAccumulator += travel;
    while (spawnAccumulator >= RING_SPACING) {
      spawnAccumulator -= RING_SPACING;
      rings.push({
        z: FAR_Z,
        magnitudes: Float32Array.from(spectrum),
        hue,
        energy: levels.overall
      });
      if (rings.length > MAX_RINGS) rings.shift();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    // Far to near, so a ring about to swallow the camera paints over the rest.
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      const scale = projectScale(ring.z, FOCAL) * params.zoom;
      if (scale <= 0.002) continue;
      const distanceFade = clamp01(1 - ring.z / FAR_Z);
      const arrivalFade = clamp01((ring.z + 25) / 55);
      const alpha = distanceFade * arrivalFade * (0.2 + ring.energy * 0.8);
      if (alpha <= 0.004) continue;

      const twist = ringTwist(ring.z, elapsedMs, params.spin);
      const bulge = 0.5 + ring.energy * 0.8;
      const ringHue = ring.hue + ring.z * 0.02;

      traceRing(ctx, cx, cy, baseRadius, ring.magnitudes, bulge, scale, twist);
      ctx.strokeStyle = hsla(ringHue, 90, 54, alpha * 0.34);
      ctx.lineWidth = clamp(scale * 5.2, 0.6, 26);
      ctx.stroke();

      // A thin, near-white core inside the wide colour stroke: the pairing is
      // what survives the bloom pass as a glowing filament rather than a smudge.
      ctx.strokeStyle = hsla(ringHue + 12, 100, 80, alpha * 0.42);
      ctx.lineWidth = clamp(scale * 1.4, 0.4, 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWaveformRing(hue: number, frame: FrameInput): void {
    const ctx = sceneLayer.ctx;
    const { waveform, levels, params, elapsedMs, beat } = frame;
    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const radius = minDim * (0.155 + levels.bass * 0.05 + beat * 0.035) * params.zoom;
    const amplitude = minDim * (0.022 + levels.overall * 0.06);
    const twist = ringTwist(0, elapsedMs, params.spin * 0.6);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    for (let i = 0; i <= RING_VERTICES; i += 1) {
      const vertex = i % RING_VERTICES;
      const angle = (vertex / RING_VERTICES) * Math.PI * 2 + twist;
      const r = radius + waveform[mirroredBand(vertex)] * amplitude;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = hsla(hue + 30, 100, 78, 0.1 + levels.overall * 0.14);
    ctx.lineWidth = clamp(minDim * 0.0015, 0.8, 2.2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAperture(hue: number, frame: FrameInput): void {
    const ctx = sceneLayer.ctx;
    const { levels, beat, params, elapsedMs } = frame;
    const cx = width / 2;
    const cy = height / 2;
    const minDim = Math.min(width, height);
    const core = minDim * (0.03 + levels.bass * 0.035 + beat * 0.04) * params.zoom;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Low per-frame alphas on purpose — see the note on accumulation in render().
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 4.5);
    glow.addColorStop(0, hsla(hue + 40, 96, 88, 0.1 + beat * 0.14));
    glow.addColorStop(0.35, hsla(hue + 10, 96, 62, 0.035 + levels.bass * 0.06));
    glow.addColorStop(1, hsla(hue, 90, 40, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, core * 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Iris blades — a slow counter-rotation against the tunnel's twist.
    const blades = 12;
    const bladeTwist = -ringTwist(0, elapsedMs, params.spin * 0.8);
    ctx.strokeStyle = hsla(hue + 24, 100, 84, 0.07 + beat * 0.16);
    ctx.lineWidth = clamp(minDim * 0.0016, 0.6, 2.4);
    for (let i = 0; i < blades; i += 1) {
      const angle = (i / blades) * Math.PI * 2 + bladeTwist;
      const inner = core * 1.25;
      const outer = core * (2.1 + levels.mid * 1.6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  function composite(bloom: number): void {
    displayCtx.globalCompositeOperation = "source-over";
    displayCtx.globalAlpha = 1;
    displayCtx.clearRect(0, 0, width, height);
    displayCtx.drawImage(sceneLayer.canvas, 0, 0);
    if (bloom <= 0.001) return;

    // Bright pass: downscale, then multiply the result by itself. Squaring the
    // channels is a cheap stand-in for a luminance threshold.
    const brightCtx = brightLayer.ctx;
    brightCtx.globalCompositeOperation = "copy";
    brightCtx.globalAlpha = 1;
    brightCtx.filter = "none";
    brightCtx.drawImage(sceneLayer.canvas, 0, 0, bloomWidth, bloomHeight);
    brightCtx.globalCompositeOperation = "multiply";
    brightCtx.drawImage(brightLayer.canvas, 0, 0);

    const blurCtx = blurLayer.ctx;
    blurCtx.globalCompositeOperation = "copy";
    blurCtx.globalAlpha = 1;
    if (supportsFilter) blurCtx.filter = `blur(${clamp(bloomWidth * 0.022, 2, 22).toFixed(1)}px)`;
    blurCtx.drawImage(brightLayer.canvas, 0, 0);
    if (supportsFilter) blurCtx.filter = "none";

    displayCtx.globalCompositeOperation = "lighter";
    displayCtx.imageSmoothingEnabled = true;
    // Two passes at different alphas: a tight core and a wide halo.
    displayCtx.globalAlpha = clamp01(bloom * 0.34);
    displayCtx.drawImage(blurLayer.canvas, 0, 0, width, height);
    displayCtx.globalAlpha = clamp01(bloom * 0.17);
    displayCtx.drawImage(blurLayer.canvas, -width * 0.02, -height * 0.02, width * 1.04, height * 1.04);
    displayCtx.globalAlpha = 1;
    displayCtx.globalCompositeOperation = "source-over";
  }

  function render(frame: FrameInput): void {
    if (width === 0 || height === 0) return;
    const { levels, params, elapsedMs, dtMs } = frame;
    const hue = sceneHue(BASE_HUE, levels, elapsedMs);

    // Depth travelled this frame. Bass is the throttle, so a drop physically
    // accelerates the tunnel instead of only brightening it.
    const travel = ((140 + levels.bass * 620 + levels.overall * 160) * dtMs) / 1000;

    // EXPOSURE: this buffer keeps its own previous frames, decaying only by
    // trailAlpha. A layer drawn additively every frame therefore settles at
    // roughly 1/trailAlpha times its per-frame alpha — about 9x at the default
    // trail. Every alpha below is chosen for that accumulated value, which is
    // why they look implausibly low read one frame at a time.
    const ctx = sceneLayer.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = hsla(hue, 55, 3.5, trailAlpha(params.trail));
    ctx.fillRect(0, 0, width, height);

    drawNebula(hue, levels, elapsedMs);
    drawStars(hue, frame, travel);
    drawTunnel(hue, frame, travel);
    drawWaveformRing(hue, frame);
    drawAperture(hue, frame);
    composite(params.bloom);
  }

  function dispose(): void {
    rings.length = 0;
    for (const canvas of [sceneLayer.canvas, brightLayer.canvas, blurLayer.canvas]) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return { resize, render, dispose };
}
