/**
 * Sound effects.
 *
 * The clips are Kenney's CC0 game-audio packs (kenney.nl) — public domain, no attribution, free
 * for commercial use. Sources and the id-to-file mapping live in tools/sfx-manifest.json, and
 * tools/build-sfx.sh converts them into the mp3s under public/sfx.
 *
 * The surface is deliberately one `play(name)` call and the names describe *events* rather than
 * sounds, so re-cutting a clip never touches game code.
 *
 * Nothing here throws into a caller: audio is decoration, and a browser that refuses it (autoplay
 * policy, no output device, an old WebView) must never take a move with it.
 */

/** Every cue, and how many numbered variants each has on disk. Frequent cues get several so a
 *  sound heard 40-80 times a game doesn't wear a hole in the player. */
const CUES = {
  'ui.tap': 1,
  'ui.error': 1,
  'team.pick': 1,
  'lobby.opponent-joined': 1,
  'setup.king': 1,
  'setup.trap': 1,
  'setup.wrong-side': 1,
  'setup.shuffle': 1,
  'setup.begin': 1,
  'piece.select': 4,
  'move.step': 2,
  'move.opponent': 2,
  'clash.impact': 1,
  'fight.fanfare': 1,
  'fight.throw': 1,
  // Eight, because they land three or four to a fight and a repeat inside one scuffle is
  // instantly audible.
  'fight.punch': 8,
  'fight.start': 1,
  'fight.win-fanfare': 1,
  'fight.lose-fanfare': 1,
  'fight.win': 1,
  'fight.lose': 1,
  'fight.tie': 1,
  'trap.spring': 1,
  'king.captured': 1,
  'result.win': 1,
  'result.lose': 1,
} as const;

export type Sfx = keyof typeof CUES;

/** Per-cue gain. The clips come from different packs at different levels, and the loud ones are
 *  the ones you hear most — trimming here is easier than re-cutting the files. */
const GAIN: Partial<Record<Sfx, number>> = {
  'fight.start': 0.85,
  'piece.select': 0.5,
  'move.step': 0.45,
  'move.opponent': 0.45,
  'ui.tap': 0.5,
  'setup.wrong-side': 0.6,
  'setup.shuffle': 0.7,
  'clash.impact': 0.8,
  'fight.fanfare': 0.7,
  'fight.win-fanfare': 0.3,
  // Several overlap inside the cloud beat, so each one sits below where a single hit would.
  'fight.punch': 0.5,
  // Half level, deliberately: the loser's flourish should register without competing with the
  // announcement of who beat them.
  'fight.lose-fanfare': 0.5,
  'king.captured': 0.9,
};

const STORAGE_KEY = 'rps-politika:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
/** Decoded clips, keyed by file stem. Populated lazily; a cue that hasn't loaded yet is skipped
 *  rather than delayed, since a late sound is worse than none. */
const buffers = new Map<string, AudioBuffer>();
const loading = new Set<string>();
/** The variant each cue played last, so the next pick can avoid it — see play(). */
const lastStem = new Map<string, string>();

function readMuted(): boolean {
  try {
    // Silent until asked otherwise: nothing stored means a first-time visitor, and the game opens
    // muted with the toggle inviting them to turn it on (see SoundToggle). Sound arriving
    // unannounced on a phone in public is the kind of thing that gets a tab closed.
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    // Private mode, or storage blocked — same default as a first-time visitor.
    return true;
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
    // The preference just won't survive the tab. Not worth telling anyone about.
  }
  if (master) master.gain.value = next ? 0 : 1;
  if (!next) void preload();
}

/**
 * Browsers refuse to start an AudioContext before a user gesture, so this runs lazily on the first
 * sound rather than at import — by which point a click has always happened. A context created too
 * early lands 'suspended' and stays there.
 */
function audio(): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  // Returning from a backgrounded tab leaves the context suspended; without this every later
  // sound is silently dropped.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return master ? { ctx, master } : null;
}

function fileStems(name: Sfx): string[] {
  const count = CUES[name];
  return count === 1 ? [name] : Array.from({ length: count }, (_, i) => `${name}.${i + 1}`);
}

async function loadClip(stem: string): Promise<void> {
  if (buffers.has(stem) || loading.has(stem)) return;
  const a = audio();
  if (!a) return;
  loading.add(stem);
  try {
    const res = await fetch(`/sfx/${stem}.mp3`);
    if (!res.ok) return;
    // decodeAudioData is the one place Safari still wants the callback form, so it's promisified
    // rather than awaited directly.
    const bytes = await res.arrayBuffer();
    const buf = await new Promise<AudioBuffer>((resolve, reject) =>
      a.ctx.decodeAudioData(bytes, resolve, reject),
    );
    buffers.set(stem, buf);
  } catch {
    // A clip that won't load simply stays silent.
  } finally {
    loading.delete(stem);
  }
}

/**
 * Warms the cache. Called on the first interaction rather than at startup: 124KB is small, but it
 * has no business competing with the splash art for a visitor who may never press anything.
 */
export function preload(): void {
  if (muted) return;
  for (const name of Object.keys(CUES) as Sfx[]) for (const stem of fileStems(name)) void loadClip(stem);
}

/**
 * The winner announcements ("BIBI WINS"), one file per portrait.
 *
 * Deliberately outside CUES: there are 30 of them and any given match can only ever need a
 * handful, so preloading them all would cost 252KB for two seconds of audio. Instead FightSequence
 * prefetches just the two portraits actually in the ring, seconds before the reveal needs them.
 */
export function prefetchClip(stem: string): void {
  if (muted) return;
  void loadClip(stem);
}

/**
 * Plays a clip by filename stem. Returns false if it isn't loaded yet, so the caller can fall back
 * to an ordinary cue rather than have the moment pass in silence — the same "a late sound is worse
 * than none" rule play() follows.
 */
export function playClip(stem: string, gain = 1): boolean {
  if (muted) return false;
  try {
    const a = audio();
    if (!a) return false;
    const buf = buffers.get(stem);
    if (!buf) {
      void loadClip(stem);
      return false;
    }
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const g = a.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(a.master);
    src.start();
    return true;
  } catch {
    return false;
  }
}

export function play(name: Sfx): void {
  if (muted) return;
  try {
    const a = audio();
    if (!a) return;
    let stems = fileStems(name);
    // Don't repeat the variant just played. Uniform random draws collide far more often than
    // people expect — four punches from eight samples repeat about 40% of the time, and inside a
    // single scuffle that is instantly audible. Only applied from three variants up: with two,
    // excluding the last one is strict alternation, which is its own kind of obvious.
    if (stems.length >= 3) {
      const previous = lastStem.get(name);
      const fresh = stems.filter((s) => s !== previous);
      if (fresh.length > 0) stems = fresh;
    }
    const stem = stems[Math.floor(Math.random() * stems.length)];
    lastStem.set(name, stem);
    const buf = buffers.get(stem);
    if (!buf) {
      // First time for this cue: fetch it now so the *next* one is instant. Deliberately not
      // played on arrival — a sound that lands 200ms after the tap reads as a glitch.
      void loadClip(stem);
      return;
    }
    const src = a.ctx.createBufferSource();
    src.buffer = buf;
    const gain = a.ctx.createGain();
    gain.gain.value = GAIN[name] ?? 1;
    src.connect(gain);
    gain.connect(a.master);
    src.start();
  } catch {
    // A sound failing is never worth interrupting the game for.
  }
}
