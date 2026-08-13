import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, act, cleanup, flushFrames } from "./helpers/renderComponent.mjs";

// Plan 022: covers the mid-unwind strand bug in useInspectorNudge — a fast
// reselect that interrupts the restore effect's 200ms unwind tween can freeze
// the frame's translate at a nonzero value forever, if the NEW selection
// needs no nudge of its own (planInspectorNudge returns null for it). See
// the hook's header comment and the "Plan 022" comments in
// components/seat-map/useInspectorNudge.ts for the full mechanism.
//
// The hook's real tweens run through lib/animateValue's rAF loop, which in
// jsdom is timer-backed and asynchronous (matchMedia reports
// prefers-reduced-motion: false here) — fighting that with real-time waits
// would make "mid-unwind" nondeterministic. Instead every test injects a
// manual-pump fake through the hook's test-only `animate` parameter, giving
// exact control over when a tween's onUpdate/onDone fire.

let useInspectorNudge;
let planInspectorNudge;
before(async () => {
  ({ useInspectorNudge } = await loadComponent("@/components/seat-map/useInspectorNudge"));
  ({ planInspectorNudge } = await loadComponent("@/lib/mapViewport"));
});

afterEach(() => cleanup());

// Geometry shared by most tests: a 1200px viewport with a frame (content) of
// the same width — scrollWidth === clientWidth, so there is NO scroll room
// and a needed nudge is forced entirely onto the translate channel, the only
// channel this hook owns. `contentWidth` lets a test widen the frame beyond
// the viewport to give the geometry real scroll room (PR #391 regression).
const VIEWPORT_WIDTH = 1200;

function stubGeometry(viewportEl, frameEl, { contentWidth = VIEWPORT_WIDTH } = {}) {
  Object.defineProperty(frameEl, "offsetLeft", { value: 0, configurable: true });
  Object.defineProperty(frameEl, "offsetWidth", { value: contentWidth, configurable: true });
  Object.defineProperty(viewportEl, "clientWidth", { value: VIEWPORT_WIDTH, configurable: true });
  Object.defineProperty(viewportEl, "scrollWidth", { value: contentWidth, configurable: true });
  // scrollLeft is a plain writable jsdom property already (defaults to 0).
}

// Seat "A" sits far enough right of the floating inspector panel to need a
// nudge; seat "B" already clears it — planInspectorNudge's own doc says
// callers must not animate at all in that case, and its resolver returns null
// for anything else.
function resolveSeatVisualX(seatId) {
  if (seatId === "A") return 0.9;
  if (seatId === "B") return 0.05;
  return null;
}

// Self-check: pin that the chosen geometry/seat numbers actually produce the
// plan shapes the tests below assume, so a drift in mapViewport's constants
// (INSPECTOR_FLOAT_*) fails loudly here instead of silently invalidating the
// hook assertions.
test("fixture geometry sanity check", () => {
  const viewport = { clientWidth: VIEWPORT_WIDTH, scrollWidth: VIEWPORT_WIDTH, scrollLeft: 0 };
  const map = { offsetLeft: 0, offsetWidth: VIEWPORT_WIDTH };

  const planA = planInspectorNudge({ seatVisualX: 0.9, map, viewport, currentTranslatePx: 0 });
  assert.ok(planA, "seat A must need a nudge");
  assert.ok(planA.translateDelta > 0, "seat A's nudge must land on the translate channel");
  assert.equal(planA.scrollDelta, 0, "geometry must give seat A no scroll room");

  const planB = planInspectorNudge({ seatVisualX: 0.05, map, viewport, currentTranslatePx: 0 });
  assert.equal(planB, null, "seat B must already clear the panel (no nudge)");
});

// A manual-pump fake standing in for lib/animateValue's animateValue. Records
// each tween start and exposes pump(t) (partial onUpdate) and finish()
// (complete + onDone); its returned cancel function marks the record
// cancelled so a stale pump/finish after cancellation is a silent no-op,
// mirroring the real animateValue's `cancelled` guard.
function makeFakeAnimate() {
  const calls = [];
  function animate({ from, to, onUpdate, onDone, reducedMotion, durationMs }) {
    if (reducedMotion || durationMs <= 0) {
      onUpdate(to);
      onDone?.();
      const record = { from, to, cancelled: false, updateCount: 1, pump() {}, finish() {} };
      calls.push(record);
      return () => {
        record.cancelled = true;
      };
    }
    const record = { from, to, cancelled: false, updateCount: 0 };
    record.pump = t => {
      if (record.cancelled) return;
      record.updateCount += 1;
      onUpdate(from + (to - from) * t);
    };
    record.finish = () => {
      if (record.cancelled) return;
      record.updateCount += 1;
      onUpdate(to);
      onDone?.();
    };
    calls.push(record);
    return () => {
      record.cancelled = true;
    };
  }
  animate.calls = calls;
  return animate;
}

// apiRef (a plain mutable object, not a React ref) lets a test reach the
// hook's returned { cancelNudge, skipNextNudge } imperatively. Assigned in a
// no-deps effect (not synchronously during render, per react-hooks/refs —
// same discipline the hook itself uses for resolveRef/animateRef): by the
// time renderElement's wrapping act() resolves, the effect has already run,
// so a test can call apiRef.current.skipNextNudge() right after awaiting
// renderHost(). skipNextNudge/cancelNudge have stable (useCallback,
// empty-deps) identity, so capturing them once stays valid through every
// later rerender even though this effect's deps ([api]) mean it only runs
// again when the api object itself changes identity.
function Host({ selectedSeatId, inspectorHidden = false, panelBreakpointPx = 0, animate, apiRef }) {
  const viewportRef = React.useRef(null);
  const frameRef = React.useRef(null);
  const api = useInspectorNudge({
    viewportRef,
    frameRef,
    selectedSeatId,
    inspectorHidden,
    panelBreakpointPx,
    resolveSeatVisualX,
    animate
  });
  React.useEffect(() => {
    if (apiRef) apiRef.current = api;
  }, [api, apiRef]);
  return React.createElement(
    "div",
    { "data-testid": "viewport", ref: viewportRef },
    React.createElement("div", { "data-testid": "frame", ref: frameRef })
  );
}

async function renderHost(props, geometryOptions) {
  const utils = await renderElement(React.createElement(Host, props));
  const viewportEl = utils.getByTestId("viewport");
  const frameEl = utils.getByTestId("frame");
  stubGeometry(viewportEl, frameEl, geometryOptions);
  return { ...utils, viewportEl, frameEl };
}

async function select(utils, animate, selectedSeatId) {
  await act(async () => {
    utils.rerender(React.createElement(Host, { selectedSeatId, animate }));
  });
}

// The trigger effect schedules a DOUBLE rAF (real, timer-backed in jsdom —
// this is the layout-settle chain the effect actually runs, not something we
// can inject). A single flushFrames() budgets exactly one 16ms frame's worth
// of margin for two nested frames, which is tight enough to flake under
// system load; flushing twice gives real headroom without weakening any
// assertion (an already-settled effect tolerates extra flushes as a no-op).
async function flushDoubleRaf() {
  await flushFrames();
  await flushFrames();
}

test("a completed nudge translates the frame", async () => {
  const animate = makeFakeAnimate();
  const utils = await renderHost({ selectedSeatId: null, animate });

  await select(utils, animate, "A");
  await flushDoubleRaf();

  assert.equal(animate.calls.length, 1, "expected exactly one tween to start for the nudge");
  animate.calls[0].finish();

  assert.notEqual(utils.frameEl.style.translate, "", "expected the frame to carry a translate");
  assert.match(utils.frameEl.style.translate, /^-\d/, "the nudge shifts the frame LEFT (negative x)");
});

test("deselect still unwinds a completed nudge to zero", async () => {
  const animate = makeFakeAnimate();
  const utils = await renderHost({ selectedSeatId: null, animate });

  await select(utils, animate, "A");
  await flushDoubleRaf();
  assert.equal(animate.calls.length, 1, "expected exactly one tween to start for the nudge");
  animate.calls[0].finish();
  assert.notEqual(utils.frameEl.style.translate, "");

  await select(utils, animate, null);
  assert.equal(animate.calls.length, 2, "expected the restore effect to start an unwind tween");
  animate.calls[1].finish();

  assert.equal(utils.frameEl.style.translate, "", "the frame must settle back at zero");
});

// THE BUG (plan 022): a fast reselect during the restore effect's unwind
// cancels that tween mid-flight without settling it. Before Step 3's fix,
// when the new selection needs no nudge of its own (plan is null), nothing
// else in the hook ever touches the translate again — the frame stays
// shifted for the rest of the selection.
test("fast reselect during the unwind settles the frame at zero", async () => {
  const animate = makeFakeAnimate();
  const utils = await renderHost({ selectedSeatId: null, animate });

  // Select A; let its nudge complete.
  await select(utils, animate, "A");
  await flushDoubleRaf();
  assert.equal(animate.calls.length, 1, "expected exactly one tween to start for the nudge");
  animate.calls[0].finish();
  const nudgedTranslate = utils.frameEl.style.translate;
  assert.notEqual(nudgedTranslate, "");

  // Deselect: the restore effect starts the 200ms unwind.
  await select(utils, animate, null);
  assert.equal(animate.calls.length, 2, "expected the restore effect to start an unwind tween");

  // Interrupt it partway through — this is the strand window.
  animate.calls[1].pump(0.5);
  const midUnwindTranslate = utils.frameEl.style.translate;
  assert.notEqual(midUnwindTranslate, "", "expected a partial (nonzero) translate mid-unwind");
  assert.notEqual(midUnwindTranslate, nudgedTranslate);

  // Reselect a seat that needs NO nudge of its own (B already clears the panel).
  await select(utils, animate, "B");
  assert.ok(animate.calls[1].cancelled, "the interrupted unwind tween must be cancelled on reselect");
  await flushDoubleRaf();

  // The fix: because a residual translate was left behind by the frozen
  // tween, a repair unwind must start even though B's own plan is null.
  assert.equal(animate.calls.length, 3, "expected a repair unwind to start for the no-nudge reselect");
  animate.calls[2].finish();

  assert.equal(
    utils.frameEl.style.translate,
    "",
    "the frame must settle at zero, not stay stranded mid-translate"
  );
});

// CodeRabbit (PR #391): the skip branch's guard must measure REMAINING
// scroll room at the current scrollLeft, not TOTAL horizontal overflow. A
// viewport already scrolled to its right boundary has plenty of total
// overflow (scrollWidth - clientWidth) but zero remaining room — the queued
// programmatic center cannot scroll any further right from there, so the
// nudge (not the skip) must run, or the selected seat can stay stranded
// under the inspector.
test("skipNextNudge defers to the center only while it can still scroll further right", async () => {
  const animate = makeFakeAnimate();
  const apiRef = { current: null };
  const CONTENT_WIDTH = 2000; // wider than the 1200px viewport: real scroll room exists in general
  const utils = await renderHost({ selectedSeatId: null, animate, apiRef }, { contentWidth: CONTENT_WIDTH });

  // Already at the RIGHT scroll boundary: total overflow is large
  // (2000 - 1200 = 800px), but remaining room from here is zero.
  utils.viewportEl.scrollLeft = CONTENT_WIDTH - VIEWPORT_WIDTH;
  apiRef.current.skipNextNudge();
  await select(utils, animate, "A");
  await flushDoubleRaf();

  assert.equal(
    animate.calls.length,
    1,
    "at the right scroll boundary the center is a no-op — the nudge must run instead of being skipped"
  );
});

// The inverse guard: with real remaining room, the skip must still be
// honored exactly as before — this pins that the fix narrowed the guard's
// FALSE cases without touching its TRUE ones.
test("skipNextNudge still defers to the center when real scroll room remains", async () => {
  const animate = makeFakeAnimate();
  const apiRef = { current: null };
  const CONTENT_WIDTH = 2000;
  const utils = await renderHost({ selectedSeatId: null, animate, apiRef }, { contentWidth: CONTENT_WIDTH });

  // scrollLeft stays at 0 — real remaining room exists, so the queued center
  // can still move the seat clear of the panel: the skip must be honored.
  apiRef.current.skipNextNudge();
  await select(utils, animate, "A");
  await flushDoubleRaf();

  assert.equal(
    animate.calls.length,
    0,
    "with real scroll room remaining, the skip must be honored and no tween should start"
  );
});

// Regression on #341: the tween must never outlive the component.
test("unmount mid-tween cancels the nudge without further writes", async () => {
  const animate = makeFakeAnimate();
  const utils = await renderHost({ selectedSeatId: null, animate });

  await select(utils, animate, "A");
  await flushDoubleRaf();
  assert.equal(animate.calls.length, 1, "expected exactly one tween to start for the nudge");
  animate.calls[0].pump(0.5);
  const countAfterPump = animate.calls[0].updateCount;

  cleanup();

  assert.ok(animate.calls[0].cancelled, "unmounting must cancel the in-flight tween");
  animate.calls[0].pump(1);
  assert.equal(
    animate.calls[0].updateCount,
    countAfterPump,
    "no further onUpdate calls may fire once the component has unmounted"
  );
});
