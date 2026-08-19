import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Guardrails for the /concepts/music-visualizer prototype — deliberately scoped
// to the lines that protect users and the app, not to how the thing looks. The
// scene's colours, layout and copy are free to change; these are not:
//   * it stays a prototype (404 in production, never indexed),
//   * it never reaches app data, auth or the server,
//   * it stays keyboard- and screen-reader-operable,
//   * the microphone path cannot feed back through the speakers.

const read = path => readFile(new URL(path, import.meta.url), "utf8");

const DIR = "../app/concepts/music-visualizer/";
const SOURCE_FILES = ["page.tsx", "MusicVisualizer.tsx", "scene.ts", "demoTrack.ts", "visualizerMath.ts"];

test("the route stays behind the prototype gate and out of search indexes", async () => {
  const source = await read(`${DIR}page.tsx`);
  assert.match(source, /function prototypesEnabled\(\)/);
  assert.match(source, /process\.env\.NODE_ENV !== "production" \|\| process\.env\.SEAT_PLANNER_ENABLE_PROTOTYPES === "true"/);
  assert.match(source, /if \(!prototypesEnabled\(\)\) \{\s*notFound\(\);/);
  assert.match(source, /robots: \{ index: false, follow: false \}/);
});

test("the prototype never touches app data, auth, or the server", async () => {
  // A concept surface that grew a Supabase read would quietly become a second,
  // unguarded path to real seat and employee data.
  const forbidden = [
    [/"use server"/, "server actions"],
    [/@\/lib\/supabase/, "the Supabase clients"],
    [/@\/app\/actions/, "server actions"],
    [/requireAdmin/, "the admin guard"],
    [/createServerClient|createBrowserClient|supabase\./, "Supabase"],
    [/NEXT_PUBLIC_|SERVICE_ROLE|ANON_KEY/, "app environment variables"],
    [/@\/lib\/(types|seatMath|mapLayoutTransform|serverAuth)/, "seat-planner modules"]
  ];
  for (const file of SOURCE_FILES) {
    const source = await read(`${DIR}${file}`);
    for (const [pattern, what] of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} must not reach ${what}`);
    }
  }
});

test("the prototype makes no network requests of its own", async () => {
  // The demo source is synthesised in the browser precisely so this holds: no
  // bundled audio asset, no CDN, nothing to fetch.
  for (const file of SOURCE_FILES) {
    const source = await read(`${DIR}${file}`);
    assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|new WebSocket/, `${file} must not make network calls`);
  }
});

test("the microphone path mutes monitoring so it cannot feed back", async () => {
  const source = await read(`${DIR}MusicVisualizer.tsx`);
  // Mic -> analyser -> output -> speakers with the gain left up is a howl in
  // any room without headphones. The mute must sit on the mic branch itself.
  assert.match(source, /const startMic[\s\S]*?rig\.output\.gain\.value = 0;[\s\S]*?\}, \[ensureRig, stopCurrentSource\]\)/);
  // ...and the playback sources must turn it back up, or picking a file after
  // the mic yields a silent track.
  assert.match(source, /const startDemo[\s\S]*?rig\.output\.gain\.value = 1;/);
  assert.match(source, /const startFile[\s\S]*?rig\.output\.gain\.value = 1;/);
});

test("audio and animation resources are released", async () => {
  const source = await read(`${DIR}MusicVisualizer.tsx`);
  // A live microphone track outliving the page is a privacy problem, not a leak.
  assert.match(source, /for \(const track of streamRef\.current\?\.getTracks\(\) \?\? \[\]\) track\.stop\(\);/);
  assert.match(source, /URL\.revokeObjectURL\(objectUrlRef\.current\)/);
  assert.match(source, /rigRef\.current\?\.context\.close\(\)/);
  assert.match(source, /return \(\) => cancelAnimationFrame\(frame\)/);
  assert.match(source, /observer\.disconnect\(\)/);
});

test("the canvas is described, and every control is labelled and reachable", async () => {
  const source = await read(`${DIR}MusicVisualizer.tsx`);

  // The canvas carries the whole visual, so it needs a name — and a note that
  // nothing is available only there.
  assert.match(source, /<canvas[\s\S]*?role="img"[\s\S]*?aria-label="/);

  // Source changes are announced rather than only shown.
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /role="alert"/);

  // Source buttons are real buttons carrying their pressed state.
  assert.match(source, /aria-pressed=\{active\}/);
  assert.doesNotMatch(source, /<div[^>]*onClick=/, "controls must be buttons, not click-handling divs");

  // Sliders: a real <label for> bound to the same generated id, plus a
  // human-readable value for screen readers (a bare number reads as noise).
  assert.match(source, /htmlFor=\{`prism-\$\{control\.key\}`\}/);
  assert.match(source, /id=\{`prism-\$\{control\.key\}`\}/);
  assert.match(source, /aria-valuetext=\{control\.format\(value\)\}/);
  assert.match(source, /aria-describedby=\{`prism-\$\{control\.key\}-hint`\}/);

  // The file picker is a visually-hidden input driving a <label>, so it keeps
  // native keyboard activation instead of a click-only shim.
  assert.match(source, /id="prism-file"[\s\S]*?className="peer sr-only"/);
  assert.match(source, /htmlFor="prism-file"/);
  assert.match(source, /peer-focus-visible:outline/);

  // Focus must stay visible on every interactive surface.
  const interactiveCount = (source.match(/<(button|input|label)\b/g) ?? []).length;
  const focusRingCount = (source.match(/focus-visible:outline\b/g) ?? []).length;
  assert.ok(focusRingCount >= 4, `expected focus rings on the controls, found ${focusRingCount} for ${interactiveCount} elements`);
});

test("hidden chrome is removed from the tab order, not just faded out", async () => {
  const source = await read(`${DIR}MusicVisualizer.tsx`);
  // opacity-0 alone leaves every control focusable but invisible — a keyboard
  // user tabs into nothing.
  assert.match(source, /aria-hidden=\{!chromeVisible\}/);
  assert.match(source, /inert=\{!chromeVisible\}/);
  // ...and the toggle that brings it back must sit outside the inert subtree.
  assert.match(source, /aria-expanded=\{chromeVisible\}/);
});

test("prefers-reduced-motion damps the scene instead of only the CSS", async () => {
  const component = await read(`${DIR}MusicVisualizer.tsx`);
  const css = await read(`${DIR}visualizer.css`);
  assert.match(component, /const REDUCED_MOTION_QUERY = "\(prefers-reduced-motion: reduce\)"/);
  assert.match(component, /window\.matchMedia\(REDUCED_MOTION_QUERY\)/);
  // The canvas animation is not a CSS transition, so a media query alone would
  // leave the spinning tunnel running for exactly the people it hurts.
  assert.match(component, /reducedMotionRef\.current \? reducedMotionParams\(active\) : active/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the bloom pass never writes back into the trail buffer", async () => {
  const source = await read(`${DIR}scene.ts`);
  // The scene canvas accumulates its own previous frames. Compositing the
  // additive bloom into it too makes the feedback loop diverge and the frame
  // saturates to white within seconds — so bloom is only ever added on the
  // display canvas.
  assert.doesNotMatch(source, /sceneLayer\.ctx\.drawImage/, "bloom must not be fed back into the trail buffer");
  assert.match(source, /displayCtx\.globalCompositeOperation = "lighter"/);
  assert.match(source, /displayCtx\.drawImage\(blurLayer\.canvas/);
});

test("the scene keeps its per-frame work allocation-free in the hot loop", async () => {
  const component = await read(`${DIR}MusicVisualizer.tsx`);
  // The analysis buffers are created once outside the rAF callback. Allocating
  // a Float32Array per frame is how a 60fps canvas turns into a GC sawtooth.
  assert.match(component, /const spectrum = new Float32Array\(SPECTRUM_SEGMENTS\);/);
  assert.match(component, /const frequencyBytes = new Uint8Array\(FFT_SIZE \/ 2\);/);
  const loopBody = component.slice(component.indexOf("const loop = (now: number)"));
  assert.doesNotMatch(loopBody.slice(0, loopBody.indexOf("scene.render")), /new (Float32Array|Uint8Array)\(/);
});

test("the animation loop survives a backgrounded tab", async () => {
  const source = await read(`${DIR}MusicVisualizer.tsx`);
  // requestAnimationFrame stops while hidden, so the first frame back reports a
  // multi-second delta. Unclamped, that single step teleports the tunnel past
  // the camera and the scene visibly resets.
  assert.match(source, /const dtMs = clamp\(now - lastTime, 0, 64\);/);
});

test("the microphone header exception is scoped to the prototype path alone", async () => {
  const config = await read("../next.config.js");

  // The app-wide posture must be untouched: every real surface still denies the
  // microphone outright. Widening this line instead of adding the scoped
  // override below would hand mic access to the whole app.
  assert.match(
    config,
    /const securityHeaders = \[[\s\S]*?\{ key: "Permissions-Policy", value: "camera=\(\), microphone=\(\), geolocation=\(\)" \}/,
    "the global Permissions-Policy must keep microphone=()"
  );

  // The override exists, names exactly one path, and widens exactly one
  // feature — camera and geolocation stay denied even there.
  assert.match(config, /const MUSIC_VISUALIZER_PATH = "\/concepts\/music-visualizer";/);
  assert.match(
    config,
    /const musicVisualizerHeaders = \[\s*\{ key: "Permissions-Policy", value: "camera=\(\), microphone=\(self\), geolocation=\(\)" \}/
  );

  // blob: media is needed for locally-picked files, and must not leak into the
  // app-wide CSP.
  assert.match(config, /contentSecurityPolicy\(\["media-src 'self' blob:"\]\)/);
  assert.doesNotMatch(
    config,
    /"object-src 'none'",\s*"media-src/,
    "media-src blob: must come from the prototype override, not the base policy"
  );

  // Order matters — the catch-all first, the override second, or the override
  // is the one that gets replaced.
  const catchAll = config.indexOf('{ source: "/:path*", headers: securityHeaders }');
  const override = config.indexOf("{ source: MUSIC_VISUALIZER_PATH, headers: musicVisualizerHeaders }");
  assert.ok(catchAll !== -1 && override !== -1, "both header rules must be registered");
  assert.ok(catchAll < override, "the prototype override must come after the catch-all to win");
});

test("every audio source marks itself live, and the loop reads that flag", async () => {
  const source = await read(`${DIR}MusicVisualizer.tsx`);

  // THE BUG THIS PINS: liveness used to be inferred from sourceNodeRef, which
  // the microphone and file paths set but the demo track does not — it builds
  // and owns its own graph. So picking the demo left the render loop on its
  // idle animation: the music played and nothing reacted. Inferring liveness
  // from one source's implementation detail is what made that possible, so the
  // flag is explicit and every start path must set it.
  for (const [name, marker] of [
    ["startMic", "const startMic"],
    ["startDemo", "const startDemo"],
    ["startFile", "const startFile"]
  ]) {
    const start = source.indexOf(marker);
    assert.ok(start !== -1, `${name} not found`);
    // Bound the slice at the next start-callback declaration so a marker in a
    // neighbouring function cannot satisfy this for the wrong one.
    const rest = source.slice(start + marker.length);
    const nextDecl = rest.search(/\n  const (startMic|startDemo|startFile|stopEverything) = /);
    const body = nextDecl === -1 ? rest : rest.slice(0, nextDecl);
    assert.match(body, /liveRef\.current = true;/, `${name} must mark the source live or the scene stays idle`);
  }

  // ...and tearing a source down must clear it, or Stop leaves the scene
  // reading an analyser nothing is feeding.
  const stopStart = source.indexOf("const stopCurrentSource");
  const stopBody = source.slice(stopStart, source.indexOf("const startMic"));
  assert.match(stopBody, /liveRef\.current = false;/);

  // The render loop must consult the explicit flag, not re-derive liveness.
  assert.match(source, /const live = rig !== null && liveRef\.current;/);
  assert.doesNotMatch(
    source,
    /const live = [^;]*sourceNodeRef/,
    "liveness must not be inferred from sourceNodeRef — the demo track never sets one"
  );
});
