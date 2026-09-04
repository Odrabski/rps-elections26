/**
 * Sound effects, synthesised in the browser.
 *
 * Every sound here is generated with the Web Audio API rather than loaded from a file: nothing to
 * download, nothing to license, and a sound can be retuned by changing a number. The trade-off is
 * that these are shaped tones, not produced cartoon audio — the intent is to swap the bodies of
 * these functions for sample playback later without any caller changing, which is why the whole
 * surface is one `play(name)` call and the names describe *events*, not sounds.
 *
 * Nothing here ever throws into a caller: audio is decoration, and a browser that refuses to play
 * it (autoplay policy, no output device, an old WebView) must not take a move with it.
 */

export type Sfx =
  | 'select' // picking up one of your own pieces
  | 'move' // a soldier lands on an empty tile
  | 'clash' // two soldiers meet and the cloud drops
  | 'capture' // you took a piece
  | 'lost-piece' // you lost one
  | 'trap' // a trap springs
  | 'king' // a king falls — the game is over
  | 'tie' // a clash tied; pick again
  | 'win'
  | 'lose'
  | 'ui'; // buttons, modals, the small stuff

const STORAGE_KEY = 'rps-politika:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode, or storage blocked outright. Defaulting to *un*muted matches what a first-time
    // visitor gets, which is the less surprising of the two.
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // Preference just won't survive the tab. Not worth telling anyone about.
  }
  if (master) master.gain.value = next ? 0 : 1;
}

/**
 * Browsers refuse to start an AudioContext until the user has interacted with the page, so this is
 * called lazily from the first sound rather than at import time — by which point a click has always
 * happened. A context created too early lands in 'suspended' and stays there.
 */
function audio(): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      return null;
    }
  }
  // Coming back from a backgrounded tab, or from a context that was suspended before the first
  // gesture, the context needs waking or every later sound is silently dropped.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return master ? { ctx, master } : null;
}

interface ToneOptions {
  /** Start frequency in Hz. */
  from: number;
  /** End frequency, for a slide. Defaults to `from` (a flat tone). */
  to?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds from now to start — for stacking a few tones into one effect. */
  delay?: number;
}

/** One shaped tone. The envelope matters more than the waveform: an instant attack and an
 *  exponential tail is what keeps these reading as "effects" rather than as beeps held too long. */
function tone(a: { ctx: AudioContext; master: GainNode }, o: ToneOptions): void {
  const { ctx: c, master: out } = a;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to !== undefined && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.duration);
  const peak = o.gain ?? 0.2;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
  osc.connect(gain);
  gain.connect(out);
  osc.start(t0);
  osc.stop(t0 + o.duration + 0.02);
}

/** Filtered white noise — the percussive half of anything that should feel physical (a landing, a
 *  collision, earth falling in). Pure tones can't do impacts. */
function noise(
  a: { ctx: AudioContext; master: GainNode },
  o: { duration: number; gain?: number; from?: number; to?: number; delay?: number },
): void {
  const { ctx: c, master: out } = a;
  const t0 = c.currentTime + (o.delay ?? 0);
  const frames = Math.max(1, Math.floor(c.sampleRate * o.duration));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(o.from ?? 1800, t0);
  if (o.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + o.duration);
  const gain = c.createGain();
  const peak = o.gain ?? 0.12;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t0);
  src.stop(t0 + o.duration + 0.02);
}

const RECIPES: Record<Sfx, (a: { ctx: AudioContext; master: GainNode }) => void> = {
  select: (a) => tone(a, { from: 620, to: 780, duration: 0.07, type: 'triangle', gain: 0.12 }),

  move: (a) => {
    tone(a, { from: 400, to: 300, duration: 0.11, type: 'triangle', gain: 0.13 });
    noise(a, { duration: 0.07, from: 1400, to: 400, gain: 0.06, delay: 0.06 }); // the landing
  },

  clash: (a) => {
    noise(a, { duration: 0.22, from: 3000, to: 300, gain: 0.16 });
    tone(a, { from: 200, to: 90, duration: 0.24, type: 'sawtooth', gain: 0.1 });
  },

  // Rising pair — the same two notes as `lost-piece`, the other way up.
  capture: (a) => {
    tone(a, { from: 520, duration: 0.09, type: 'square', gain: 0.11 });
    tone(a, { from: 780, duration: 0.14, type: 'square', gain: 0.11, delay: 0.08 });
  },

  'lost-piece': (a) => {
    tone(a, { from: 420, duration: 0.09, type: 'square', gain: 0.1 });
    tone(a, { from: 260, to: 180, duration: 0.2, type: 'square', gain: 0.1, delay: 0.08 });
  },

  // A snap, then the sound of something dropping away underneath it.
  trap: (a) => {
    noise(a, { duration: 0.09, from: 5000, to: 900, gain: 0.14 });
    tone(a, { from: 300, to: 60, duration: 0.4, type: 'sawtooth', gain: 0.13, delay: 0.05 });
    noise(a, { duration: 0.3, from: 700, to: 120, gain: 0.08, delay: 0.12 });
  },

  king: (a) => {
    noise(a, { duration: 0.3, from: 4000, to: 200, gain: 0.16 });
    tone(a, { from: 160, to: 70, duration: 0.6, type: 'sawtooth', gain: 0.14, delay: 0.04 });
  },

  // Deliberately unresolved — two notes a tone apart, going nowhere, because nothing was decided.
  tie: (a) => {
    tone(a, { from: 500, duration: 0.12, type: 'triangle', gain: 0.11 });
    tone(a, { from: 560, duration: 0.16, type: 'triangle', gain: 0.11, delay: 0.11 });
  },

  win: (a) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(a, { from: f, duration: 0.34, type: 'triangle', gain: 0.13, delay: i * 0.11 }),
    );
  },

  lose: (a) => {
    [440, 392, 329.63, 261.63].forEach((f, i) =>
      tone(a, { from: f, duration: 0.4, type: 'sine', gain: 0.13, delay: i * 0.14 }),
    );
  },

  ui: (a) => tone(a, { from: 700, duration: 0.05, type: 'sine', gain: 0.09 }),
};

export function play(name: Sfx): void {
  if (muted) return;
  try {
    const a = audio();
    if (a) RECIPES[name](a);
  } catch {
    // A sound failing is never worth interrupting the game for.
  }
}
