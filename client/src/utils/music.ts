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
/** Menu music, so it can sit a little higher than a bed under gameplay would — but still well
 *  under the interface sounds playing over it. */
const VOLUME = 0.34;

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

/** Set while we're waiting for a gesture to retry after a blocked autoplay, so the listeners are
 *  only ever attached once. */
let awaitingGesture = false;

function playWhenAllowed(a: HTMLAudioElement): void {
  void a.play().catch(() => {
    // Expected, not exceptional: the menu opens on its own when the splash times out, so the
    // browser has usually seen no gesture yet and refuses. Retry on the first one — without this
    // the track simply never starts for anyone who lets the splash run out, which is everyone.
    if (awaitingGesture) return;
    awaitingGesture = true;
    const retry = () => {
      awaitingGesture = false;
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      if (wanted && !muted()) void a.play().catch(() => {});
    };
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  });
}

function sync(): void {
  const a = element();
  if (!a) return;
  if (wanted && !muted()) playWhenAllowed(a);
  else a.pause();
}

/** Called once the splash clears. Safe to call repeatedly — an already-playing track is left
 *  alone, since sync() only calls play() on a paused element. */
export function startMusic(): void {
  wanted = true;
  sync();
}

export function stopMusic(): void {
  wanted = false;
  const a = element();
  if (!a) return;
  a.pause();
  // Rewound so returning to the menu opens on the track's start rather than wherever it was cut
  // off mid-phrase.
  a.currentTime = 0;
}

/** Mirrors the effects' mute toggle. Kept as a separate call rather than importing sfx.ts, which
 *  would make the two modules import each other. */
export function setMusicMuted(next: boolean): void {
  if (next) element()?.pause();
  else sync();
}
