/**
 * The looping background track.
 *
 * Deliberately an <audio> element rather than the Web Audio graph the effects use. The track is
 * ~31 seconds, and decoding that into an AudioBuffer costs about 5.2MB of resident memory — this
 * game already fights phone browsers discarding the tab under memory pressure (see the splash
 * skip in App.tsx), and spending 5MB on background music is exactly how that gets worse. An
 * <audio> element streams it instead, and gets native looping for free.
 *
 * Mute is shared with the effects through the same localStorage key, but applied separately: the
 * effects are muted at their AudioContext's master gain, and this element isn't in that graph.
 */

const SRC = '/sfx/music.loop.mp3';
const STORAGE_KEY = 'rps-politika:muted';
/** Well under the effects. It has to sit beneath an announcer shouting FIGHT without fighting it. */
const VOLUME = 0.28;

let el: HTMLAudioElement | null = null;
let wanted = false; // whether the game currently wants music, independent of mute

function muted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!el) {
    el = new Audio(SRC);
    el.loop = true;
    el.volume = VOLUME;
    // Nothing is fetched until play() is called, so this costs nothing on the home screen.
    el.preload = 'none';
  }
  return el;
}

function sync(): void {
  const a = element();
  if (!a) return;
  if (wanted && !muted()) {
    // Rejected if the browser hasn't seen a gesture yet. By the time a match starts several
    // clicks have happened, but a rejection here must never surface as an error.
    void a.play().catch(() => {});
  } else {
    a.pause();
  }
}

/** Called as a match begins. Safe to call repeatedly — an already-playing track is left alone. */
export function startMusic(): void {
  wanted = true;
  sync();
}

export function stopMusic(): void {
  wanted = false;
  const a = element();
  if (!a) return;
  a.pause();
  // Rewound so the next match opens on the track's start rather than wherever the last one left
  // off mid-phrase.
  a.currentTime = 0;
}

/** Mirrors the effects' mute toggle. Kept as a separate call rather than importing sfx.ts, which
 *  would make the two modules import each other. */
export function setMusicMuted(next: boolean): void {
  if (next) element()?.pause();
  else sync();
}
