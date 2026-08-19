/**
 * PROTOTYPE ONLY — the "Demo" source for /concepts/music-visualizer.
 *
 * A small Web Audio synth rather than a bundled audio file. Two reasons: no
 * binary asset enters the repo, and the demo needs no network at all, so the
 * prototype demonstrates itself on a locked-down machine or in a CI browser.
 *
 * It is written to give the analyser real material in every band the scene
 * reads — a pitch-swept kick for bass, a filtered saw pad for mids, hats and a
 * plucked arp for treble — because a single sine wave makes any visualizer look
 * broken.
 *
 * Scheduling uses the standard Web Audio lookahead pattern: a coarse timer wakes
 * up often and queues notes a short way into the future against the audio
 * clock. Scheduling straight off setInterval would jitter audibly, since timer
 * callbacks are not sample-accurate.
 */

const BPM = 96;
const STEPS_PER_BAR = 16;
const BARS = 4;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;
/** Sixteenth-note duration in seconds. */
const STEP_SECONDS = 60 / BPM / 4;

const TIMER_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.18;

/** A minor · i – VI – III – VII, one bar each, voiced low-to-high in MIDI. */
const PROGRESSION: readonly (readonly number[])[] = [
  [45, 57, 60, 64, 69], // Am
  [41, 53, 57, 60, 65], // F
  [48, 55, 60, 64, 67], // C
  [43, 50, 59, 62, 67] // G
];

const KICK_STEPS = new Set([0, 4, 8, 12]);
const GHOST_KICK_STEPS = new Set([14]);
const BASS_STEPS = new Set([0, 3, 6, 8, 11]);
const ACCENT_HAT_STEPS = new Set([2, 6, 10, 14]);

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export type DemoTrack = {
  start(): void;
  stop(): void;
};

/**
 * Short exponentially-decaying noise impulse response. A real IR would be a
 * download; this is enough to stop the synth sounding like it is in a box, and
 * the tail is what gives the visualiser something to decay against.
 */
function createReverbImpulse(context: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return impulse;
}

function createNoiseBuffer(context: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Builds the demo instrument graph on `context` and returns transport controls.
 * Nothing is scheduled until `start()`; `stop()` fades out and tears the graph
 * down so a second run starts clean.
 */
export function createDemoTrack(context: AudioContext, destination: AudioNode): DemoTrack {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(destination);

  const reverb = context.createConvolver();
  reverb.buffer = createReverbImpulse(context, 2.6, 2.4);
  const reverbSend = context.createGain();
  reverbSend.gain.value = 0.34;
  reverbSend.connect(reverb);
  reverb.connect(master);

  // Dotted-sixteenth delay: lands between the arp notes instead of doubling them.
  const delay = context.createDelay(1);
  delay.delayTime.value = STEP_SECONDS * 1.5;
  const delayFeedback = context.createGain();
  delayFeedback.gain.value = 0.36;
  const delayTone = context.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 2600;
  delay.connect(delayTone);
  delayTone.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(master);
  delay.connect(reverbSend);

  const noiseBuffer = createNoiseBuffer(context, 1);

  function kick(time: number, level: number): void {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(155, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.11);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  function hat(time: number, level: number): void {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7400;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    gain.connect(reverbSend);
    source.start(time);
    source.stop(time + 0.09);
  }

  function bass(time: number, midi: number): void {
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(midi - 12);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, time);
    filter.frequency.exponentialRampToValueAtTime(220, time + 0.22);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.26, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.36);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + 0.42);
  }

  function pad(time: number, chord: readonly number[], duration: number): void {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, time);
    filter.frequency.linearRampToValueAtTime(1650, time + duration * 0.55);
    filter.frequency.linearRampToValueAtTime(620, time + duration);
    filter.Q.value = 3.5;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.07, time + 0.5);
    gain.gain.setValueAtTime(0.07, time + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0.0001, time + duration);

    filter.connect(gain);
    gain.connect(master);
    gain.connect(reverbSend);

    // Two saws a few cents apart per note: the beating between them is what
    // reads as "pad" rather than "organ".
    for (const midi of chord) {
      for (const detune of [-7, 7]) {
        const osc = context.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = midiToHz(midi);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + duration + 0.1);
      }
    }
  }

  function arp(time: number, midi: number): void {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(midi);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.1, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    osc.connect(gain);
    gain.connect(master);
    gain.connect(delay);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  function scheduleStep(step: number, time: number): void {
    const bar = Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length;
    const inBar = step % STEPS_PER_BAR;
    const chord = PROGRESSION[bar];

    if (inBar === 0) pad(time, chord, STEP_SECONDS * STEPS_PER_BAR);
    if (KICK_STEPS.has(inBar)) kick(time, 0.85);
    else if (GHOST_KICK_STEPS.has(inBar) && bar % 2 === 1) kick(time, 0.4);
    if (inBar % 2 === 0) hat(time, ACCENT_HAT_STEPS.has(inBar) ? 0.052 : 0.026);
    if (BASS_STEPS.has(inBar)) bass(time, chord[0]);

    // Offbeat sixteenths, walking up the upper voicing and back down.
    if (inBar % 2 === 1) {
      const upper = chord.slice(1);
      const walk = [0, 1, 2, 3, 2, 1, 3, 2];
      const note = upper[walk[Math.floor(inBar / 2) % walk.length] % upper.length];
      arp(time, note + 12);
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let step = 0;
  let nextStepTime = 0;

  return {
    start() {
      if (timer !== null) return;
      step = 0;
      nextStepTime = context.currentTime + 0.12;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0.0001, context.currentTime);
      master.gain.linearRampToValueAtTime(0.9, context.currentTime + 0.6);
      timer = setInterval(() => {
        while (nextStepTime < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
          scheduleStep(step, nextStepTime);
          nextStepTime += STEP_SECONDS;
          step = (step + 1) % TOTAL_STEPS;
        }
      }, TIMER_MS);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      // Let the tail ring out before dropping the graph.
      setTimeout(() => {
        try {
          master.disconnect();
          reverb.disconnect();
          reverbSend.disconnect();
          delay.disconnect();
          delayTone.disconnect();
          delayFeedback.disconnect();
        } catch {
          // Already torn down (double stop, or the context closed first).
        }
      }, 600);
    }
  };
}
