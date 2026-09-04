/**
 * The looping tracks: the menu bed, and the two that play under the result screen.
 *
 * Deliberately one <audio> element rather than the Web Audio graph the effects use. The tracks run
 * from ~30 seconds (the result loops) to a couple of minutes (the menu bed), and decoding that into
 * an AudioBuffer costs on the order of megabytes of resident memory apiece — this game already
 * fights phone browsers discarding the tab under memory pressure (see the splash skip in App.tsx),
 * and spending that on background audio is exactly how it gets worse. An <audio> element streams
 * instead, and gets native looping for free.
 *
 * One element, swapped between sources, because only one is ever wanted at a time: you are either
 * in the menu or looking at a result, never both.
 *
 * Mute is shared with the effects through the same localStorage key but applied separately — this
 * element isn't in the graph their master gain controls.
 */

export type Track = 'menu' | 'win' | 'lose';

const SOURCES: Record<Track, string> = {
  menu: '/sfx/music.loop.mp3',
  win: '/sfx/loop.win.mp3',
  lose: '/sfx/loop.lose.mp3',
};

/** The result tracks sit higher than the menu bed: nothing competes with them, and they carry the
 *  moment rather than sitting under it. */
const VOLUME: Record<Track, number> = { menu: 0.17, win: 0.44, lose: 0.4 };

const STORAGE_KEY = 'rps-politika:muted';

let el: HTMLAudioElement | null = null;
let current: Track | null = null;
let awaitingGesture = false;

function muted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode, or storage blocked. Unmuted matches what a first-time visitor gets.
    return false;
  }
}

function element(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!el) {
    el = new Audio();
    el.loop = true;
    // Nothing is fetched until a track is chosen, so the home screen pays for none of this and the
    // result tracks are only pulled once a game has actually ended.
    el.preload = 'none';
  }
  return el;
}

function playWhenAllowed(a: HTMLAudioElement): void {
  void a.play().catch(() => {
    // Expected, not exceptional: the menu opens on its own when the splash times out, so the
    // browser has usually seen no gesture yet and refuses. Retry on the first one — without this
    // the track never starts for anyone who lets the splash run out, which is everyone.
    if (awaitingGesture) return;
    awaitingGesture = true;
    const retry = () => {
      awaitingGesture = false;
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
      if (current && !muted()) void a.play().catch(() => {});
    };
    window.addEventListener('pointerdown', retry, { once: true });
    window.addEventListener('keydown', retry, { once: true });
  });
}

/**
 * Switches to a track, or to silence with null. Asking for the one already playing does nothing,
 * so this is safe to call straight from a render-driven effect.
 */
export function setTrack(next: Track | null): void {
  const a = element();
  if (!a || next === current) return;
  current = next;

  if (!next) {
    a.pause();
    return;
  }

  a.src = SOURCES[next];
  a.volume = VOLUME[next];
  // Each one starts from its beginning rather than wherever the last was cut off.
  a.currentTime = 0;
  if (!muted()) playWhenAllowed(a);
}

/** Mirrors the effects' mute toggle. A separate call rather than importing sfx.ts, which would
 *  make the two modules import each other. */
export function setMusicMuted(next: boolean): void {
  const a = element();
  if (!a) return;
  if (next) a.pause();
  else if (current) playWhenAllowed(a);
}
