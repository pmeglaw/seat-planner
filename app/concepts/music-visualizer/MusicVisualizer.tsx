"use client";

/**
 * PROTOTYPE ONLY — /concepts/music-visualizer.
 *
 * Self-contained: no server actions, no Supabase, no seat-planner data. It owns
 * the audio graph and the animation loop; the analysis maths lives in
 * visualizerMath.ts (unit tested) and the draw calls in scene.ts.
 *
 * THE AUDIO GRAPH is always source -> analyser -> output -> destination, with
 * output muted for the microphone. Tapping the analyser and leaving it
 * unconnected would work too, but routing everything through one gain node
 * means the mute is a single value rather than a conditional wiring, and a
 * conditional connect is exactly how you ship a howling feedback loop.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./visualizer.css";
import { createDemoTrack, type DemoTrack } from "./demoTrack";
import { createScene, type Scene } from "./scene";
import {
  DEFAULT_SCENE_PARAMS,
  SCENE_PARAM_RANGES,
  SPECTRUM_SEGMENTS,
  applySensitivity,
  bandMagnitudes,
  clamp,
  createBeatDetector,
  logBandRanges,
  reducedMotionParams,
  smoothSpectrum,
  smoothTowards,
  spectrumLevels,
  type BandRange,
  type Levels,
  type SceneParams
} from "./visualizerMath";

const FFT_SIZE = 2048;
/** Slider metadata, rendered in this order. */
const CONTROLS: { key: keyof SceneParams; label: string; hint: string; format: (value: number) => string }[] = [
  { key: "sensitivity", label: "Sensitivity", hint: "How hard the scene reacts to level", format: v => `${v.toFixed(2)}×` },
  { key: "trail", label: "Trail", hint: "How long motion smears behind itself", format: v => `${Math.round(v * 100)}%` },
  { key: "bloom", label: "Bloom", hint: "Glow bleeding off the bright edges", format: v => `${v.toFixed(2)}×` },
  { key: "zoom", label: "Zoom", hint: "Field of view down the tunnel", format: v => `${v.toFixed(2)}×` },
  { key: "spin", label: "Spin", hint: "Rotation rate; negative reverses", format: v => `${v.toFixed(2)}×` }
];

type SourceKind = "idle" | "mic" | "file" | "demo";

const SOURCE_LABELS: Record<SourceKind, string> = {
  idle: "Idle · choose a source",
  mic: "Listening to the microphone",
  file: "Playing your audio file",
  demo: "Playing the built-in demo track"
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

type AudioRig = {
  context: AudioContext;
  analyser: AnalyserNode;
  output: GainNode;
  /** File playback. Built with the rig because an element can only ever have
   *  ONE MediaElementSource — creating a second one throws, so both are made
   *  once and reused for every file the user picks. */
  element: HTMLAudioElement;
  elementNode: MediaElementAudioSourceNode;
};

export function MusicVisualizer() {
  const [source, setSource] = useState<SourceKind>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [params, setParams] = useState<SceneParams>(DEFAULT_SCENE_PARAMS);
  const [chromeVisible, setChromeVisible] = useState(true);

  // Read through useSyncExternalStore rather than state-plus-effect: matchMedia
  // is an external store, and mirroring it into state means the first paint is
  // always wrong for anyone who has the preference set.
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotion, () => false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  const rigRef = useRef<AudioRig | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const demoRef = useRef<DemoTrack | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Live mirrors for the rAF loop, so dragging a slider never restarts it.
  const paramsRef = useRef(params);
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  /** Lazily built — an AudioContext created before a user gesture starts suspended. */
  const ensureRig = useCallback(async (): Promise<AudioRig> => {
    if (!rigRef.current) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new Ctor();
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // Some smoothing in the analyser itself, the rest in the envelope
      // follower — all of it here makes transients mushy, none makes them jitter.
      analyser.smoothingTimeConstant = 0.72;
      const output = context.createGain();
      output.gain.value = 1;
      analyser.connect(output);
      output.connect(context.destination);

      const element = new Audio();
      element.crossOrigin = "anonymous";
      element.loop = true;
      // Left unconnected until a file is chosen; createMediaElementSource also
      // reroutes the element away from the default output, so it stays silent.
      const elementNode = context.createMediaElementSource(element);

      rigRef.current = { context, analyser, output, element, elementNode };
    }
    if (rigRef.current.context.state === "suspended") await rigRef.current.context.resume();
    return rigRef.current;
  }, []);

  const stopCurrentSource = useCallback(() => {
    demoRef.current?.stop();
    demoRef.current = null;

    const rig = rigRef.current;
    if (rig) {
      rig.element.pause();
      rig.element.currentTime = 0;
      rig.elementNode.disconnect();
    }

    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;

    // The element node is owned by the rig and reused, so it is only
    // disconnected above — never torn down here.
    if (sourceNodeRef.current && sourceNodeRef.current !== rig?.elementNode) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Already disconnected.
      }
    }
    sourceNodeRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Every one of these "helpful" DSP stages fights a visualizer: AGC
        // flattens dynamics, noise suppression eats the top end.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      const rig = await ensureRig();
      stopCurrentSource();
      streamRef.current = stream;
      const node = rig.context.createMediaStreamSource(stream);
      node.connect(rig.analyser);
      sourceNodeRef.current = node;
      // Muted output: the analyser still sees the signal, the speakers do not,
      // and the room does not scream.
      rig.output.gain.value = 0;
      setSource("mic");
      setStatusDetail("Monitoring is muted to prevent feedback");
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setError(
        denied
          ? "Microphone permission was denied. Allow it in your browser's site settings, or try the demo track."
          : "No microphone was available. Try the demo track or upload a file instead."
      );
    }
  }, [ensureRig, stopCurrentSource]);

  const startDemo = useCallback(async () => {
    setError(null);
    try {
      const rig = await ensureRig();
      stopCurrentSource();
      rig.output.gain.value = 1;
      const track = createDemoTrack(rig.context, rig.analyser);
      track.start();
      demoRef.current = track;
      setSource("demo");
      setFileName(null);
      setStatusDetail("Synthesised in the browser — no audio file, no network");
    } catch {
      setError("Web Audio could not start in this browser.");
    }
  }, [ensureRig, stopCurrentSource]);

  const startFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const rig = await ensureRig();
        stopCurrentSource();

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        rig.element.src = url;

        rig.elementNode.connect(rig.analyser);
        sourceNodeRef.current = rig.elementNode;
        rig.output.gain.value = 1;

        await rig.element.play();
        setSource("file");
        setFileName(file.name);
        setStatusDetail("Looping — pick another file any time");
      } catch {
        setError("That file could not be decoded. Try an MP3, WAV, OGG or M4A.");
      }
    },
    [ensureRig, stopCurrentSource]
  );

  const stopEverything = useCallback(() => {
    stopCurrentSource();
    setSource("idle");
    setStatusDetail(null);
    setFileName(null);
  }, [stopCurrentSource]);

  // Scene lifecycle + sizing. The canvas is sized from its own box so the
  // backing store always matches the CSS pixels it covers.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const scene = createScene(canvas);
    if (!scene) {
      setError("This browser could not provide a 2D canvas context.");
      return;
    }
    sceneRef.current = scene;

    const applySize = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      scene.resize(Math.max(1, rect.width), Math.max(1, rect.height), dpr);
    };
    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(stage);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // The animation loop. Mounted once and never restarted: everything it needs
  // that can change is read through a ref.
  useEffect(() => {
    let frame = 0;
    let lastTime = 0;
    let startTime = 0;

    const spectrum = new Float32Array(SPECTRUM_SEGMENTS);
    const spectrumTarget = new Float32Array(SPECTRUM_SEGMENTS);
    const waveform = new Float32Array(SPECTRUM_SEGMENTS);
    const frequencyBytes = new Uint8Array(FFT_SIZE / 2);
    const timeBytes = new Uint8Array(FFT_SIZE);
    const levels: Levels = { bass: 0, mid: 0, treble: 0, overall: 0 };
    const beatDetector = createBeatDetector();
    let beat = 0;
    let ranges: BandRange[] | null = null;
    let rangesSampleRate = 0;

    /** Slow breathing pattern so the stage is alive before a source is chosen. */
    const idleSpectrum = (elapsedMs: number) => {
      for (let i = 0; i < SPECTRUM_SEGMENTS; i += 1) {
        const wave = Math.sin(elapsedMs * 0.0009 + i * 0.17) * 0.5 + 0.5;
        spectrumTarget[i] = wave * 0.22 * Math.exp(-i / 46) + 0.015;
      }
      return {
        bass: 0.1 + Math.sin(elapsedMs * 0.0011) * 0.05,
        mid: 0.08 + Math.sin(elapsedMs * 0.0007 + 1.4) * 0.04,
        treble: 0.05 + Math.sin(elapsedMs * 0.0013 + 2.6) * 0.03,
        overall: 0.09
      };
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const scene = sceneRef.current;
      if (!scene) return;
      if (startTime === 0) {
        startTime = now;
        lastTime = now;
      }
      // Clamp dt so a backgrounded tab does not resume with one enormous step
      // that teleports the tunnel past the camera.
      const dtMs = clamp(now - lastTime, 0, 64);
      lastTime = now;
      const elapsedMs = now - startTime;

      const active = paramsRef.current;
      const effective = reducedMotionRef.current ? reducedMotionParams(active) : active;
      const rig = rigRef.current;
      const live = rig !== null && sourceNodeRef.current !== null;

      let rawBass = 0;
      if (live && rig) {
        const { analyser, context } = rig;
        if (!ranges || rangesSampleRate !== context.sampleRate) {
          ranges = logBandRanges(SPECTRUM_SEGMENTS, context.sampleRate, FFT_SIZE);
          rangesSampleRate = context.sampleRate;
        }
        analyser.getByteFrequencyData(frequencyBytes);
        analyser.getByteTimeDomainData(timeBytes);

        bandMagnitudes(frequencyBytes, ranges, spectrumTarget);
        for (let i = 0; i < SPECTRUM_SEGMENTS; i += 1) {
          spectrumTarget[i] = applySensitivity(spectrumTarget[i], effective.sensitivity);
        }

        const measured = spectrumLevels(frequencyBytes, context.sampleRate, FFT_SIZE);
        rawBass = measured.bass;
        levels.bass = smoothTowards(levels.bass, applySensitivity(measured.bass, effective.sensitivity), dtMs, 45, 220);
        levels.mid = smoothTowards(levels.mid, applySensitivity(measured.mid, effective.sensitivity), dtMs, 60, 260);
        levels.treble = smoothTowards(levels.treble, applySensitivity(measured.treble, effective.sensitivity), dtMs, 40, 200);
        levels.overall = smoothTowards(levels.overall, applySensitivity(measured.overall, effective.sensitivity), dtMs, 60, 300);

        // Decimate the time domain onto the ring's vertex count.
        const stride = timeBytes.length / SPECTRUM_SEGMENTS;
        for (let i = 0; i < SPECTRUM_SEGMENTS; i += 1) {
          const sample = (timeBytes[Math.floor(i * stride)] - 128) / 128;
          waveform[i] = smoothTowards(waveform[i], clamp(sample, -1, 1), dtMs, 10, 40);
        }
      } else {
        const idle = idleSpectrum(elapsedMs);
        levels.bass = smoothTowards(levels.bass, idle.bass, dtMs, 200, 400);
        levels.mid = smoothTowards(levels.mid, idle.mid, dtMs, 200, 400);
        levels.treble = smoothTowards(levels.treble, idle.treble, dtMs, 200, 400);
        levels.overall = smoothTowards(levels.overall, idle.overall, dtMs, 200, 400);
        for (let i = 0; i < SPECTRUM_SEGMENTS; i += 1) {
          waveform[i] = smoothTowards(waveform[i], Math.sin(elapsedMs * 0.0016 + i * 0.29) * 0.18, dtMs, 60, 160);
        }
      }

      smoothSpectrum(spectrum, spectrumTarget, dtMs, 30, 190);

      // Beat runs off the RAW bass so the flash does not inherit the envelope
      // follower's lag — the whole point is that it lands on the transient.
      if (live && beatDetector.push(rawBass, now)) beat = 1;
      else beat = Math.max(0, beat * Math.exp(-dtMs / 190));

      scene.render({ spectrum, waveform, levels, beat, params: effective, elapsedMs, dtMs });
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Teardown on unmount: stop the mic, close the context, release the blob URL.
  useEffect(() => {
    return () => {
      stopCurrentSource();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      void rigRef.current?.context.close().catch(() => undefined);
      rigRef.current = null;
    };
  }, [stopCurrentSource]);

  const setParam = useCallback((key: keyof SceneParams, value: number) => {
    setParams(previous => ({ ...previous, [key]: value }));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void stage.requestFullscreen().catch(() => undefined);
  }, []);

  const statusText = useMemo(() => {
    const base = SOURCE_LABELS[source];
    const suffix = source === "file" && fileName ? ` — ${fileName}` : "";
    return statusDetail ? `${base}${suffix} · ${statusDetail}` : `${base}${suffix}`;
  }, [source, fileName, statusDetail]);

  return (
    <div className="prism-stage relative min-h-screen w-full overflow-hidden bg-[#04060d] font-sans text-white antialiased">
      <div ref={stageRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Animated audio visualisation: a spectrum tunnel receding to a bright aperture, surrounded by an orbiting particle field. Decorative — every control is available as a labelled button or slider."
          className="block h-full w-full"
        />
      </div>

      <button
        type="button"
        onClick={() => setChromeVisible(visible => !visible)}
        className="absolute right-4 top-4 z-20 border border-white/15 bg-black/40 px-3 py-2 text-[12px] font-medium tracking-wide text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
        aria-expanded={chromeVisible}
      >
        {chromeVisible ? "Hide controls" : "Show controls"}
      </button>

      <div
        className={`pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 pt-16 transition-opacity duration-500 sm:p-6 ${
          chromeVisible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={!chromeVisible}
        inert={!chromeVisible}
      >
        <header className="pointer-events-auto w-full max-w-md border border-white/10 bg-black/35 p-4 backdrop-blur-xl sm:p-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[26px] font-semibold leading-none tracking-[0.18em]">PRISM</h1>
            <span className="text-[11px] font-medium uppercase tracking-[0.32em] text-sky-200/70">Visualizer</span>
          </div>
          <p className="mt-3 hidden text-[13px] leading-[1.6] text-white/65 sm:block">
            See the sound. A spectrum tunnel carries the last few seconds of music toward you, an orbiting field
            answers the top end, and the aperture flares on every onset.
          </p>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Audio source">
            <SourceButton active={source === "mic"} onClick={startMic}>
              Microphone
            </SourceButton>

            <input
              id="prism-file"
              type="file"
              accept="audio/*"
              className="peer sr-only"
              onChange={event => {
                const file = event.target.files?.[0];
                // Clear the value so re-picking the same file still fires change.
                event.target.value = "";
                if (file) void startFile(file);
              }}
            />
            <label
              htmlFor="prism-file"
              className={`cursor-pointer border px-3 py-2 text-[12.5px] font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-300 ${
                source === "file"
                  ? "border-sky-300/70 bg-sky-300/20 text-white"
                  : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              Audio file
            </label>

            <SourceButton active={source === "demo"} onClick={startDemo}>
              Demo track
            </SourceButton>

            {source !== "idle" ? (
              <SourceButton active={false} onClick={stopEverything}>
                Stop
              </SourceButton>
            ) : null}
          </div>

          <p role="status" aria-live="polite" className="mt-3 text-[12px] leading-[1.5] text-white/55">
            {statusText}
          </p>
          {error ? (
            <p role="alert" className="mt-2 border-l-2 border-amber-300 pl-2 text-[12px] leading-[1.5] text-amber-200">
              {error}
            </p>
          ) : null}
          {reducedMotion ? (
            <p className="mt-2 text-[12px] leading-[1.5] text-sky-200/70">
              Reduced-motion is on, so spin and depth rush are held back. The scene still tracks the music.
            </p>
          ) : null}
        </header>

        <div className="pointer-events-auto mt-4 max-h-[46vh] w-full self-end overflow-y-auto border border-white/10 bg-black/35 p-4 backdrop-blur-xl sm:max-h-none sm:w-[320px] sm:overflow-visible sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">Aperture</h2>
            <div className="flex gap-2">
              <ChromeButton onClick={toggleFullscreen}>Fullscreen</ChromeButton>
              <ChromeButton onClick={() => setParams(DEFAULT_SCENE_PARAMS)}>Reset</ChromeButton>
            </div>
          </div>

          <div className="mt-4 space-y-3 sm:space-y-3.5">
            {CONTROLS.map(control => {
              const range = SCENE_PARAM_RANGES[control.key];
              const value = params[control.key];
              return (
                <div key={control.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor={`prism-${control.key}`} className="text-[12.5px] font-medium text-white/80">
                      {control.label}
                    </label>
                    <span className="font-mono text-[11.5px] tabular-nums text-sky-200/80">{control.format(value)}</span>
                  </div>
                  <input
                    id={`prism-${control.key}`}
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={value}
                    aria-describedby={`prism-${control.key}-hint`}
                    aria-valuetext={control.format(value)}
                    onChange={event => setParam(control.key, Number(event.target.value))}
                    className="prism-range mt-2 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
                  />
                  <p
                    id={`prism-${control.key}-hint`}
                    className="sr-only mt-1 text-[11px] leading-[1.4] text-white/40 sm:not-sr-only"
                  >
                    {control.hint}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border px-3 py-2 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${
        active
          ? "border-sky-300/70 bg-sky-300/20 text-white"
          : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ChromeButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
    >
      {children}
    </button>
  );
}
