/**
 * What the player wants to hear: two independent channels, background music and sound effects.
 *
 * Both are chosen on the splash before the game starts, and can be changed at any time from the
 * speaker button's menu. There is no separate master mute — with both channels one tap away in the
 * corner, a third value that overrides them would only ever contradict what the menu was showing.
 * "Muted" is simply both channels being off, which is what the speaker icon reports.
 *
 * Kept in its own module rather than in sfx.ts or music.ts because both need it and those two must
 * not import each other — music.ts streams through an <audio> element that sfx.ts's gain node has
 * no control over, which is exactly why they were separate to begin with.
 *
 * Values are cached in memory: `play()` asks whether it is silenced dozens of times a match, and
 * that has no business hitting localStorage each time.
 */

const KEY = {
  music: 'rps-politika:music',
  sfx: 'rps-politika:sfx',
  /** Retired. Read once, so someone who muted the game back when it was a single switch opens it
   *  silent rather than having both channels spring back on. */
  legacyMute: 'rps-politika:muted',
} as const;

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === '1';
  } catch {
    // Private mode, or storage blocked. The default is what a first-time visitor gets.
    return fallback;
  }
}

function write(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // The preference just won't survive the tab. Not worth telling anyone about.
  }
}

/** Both channels default on; a standing mute from the old single switch turns both off instead. */
const defaultOn = !read(KEY.legacyMute, false);

let musicOn = read(KEY.music, defaultOn);
let sfxOn = read(KEY.sfx, defaultOn);

export type Prefs = { music: boolean; sfx: boolean };

/** How the splash toggles and the speaker menu should both appear when they open. */
export function currentPrefs(): Prefs {
  return { music: musicOn, sfx: sfxOn };
}

/** Stores both at once — what pressing start on the splash does. */
export function savePrefs(next: Prefs): void {
  setMusicPref(next.music);
  setSfxPref(next.sfx);
}

export function setMusicPref(next: boolean): void {
  musicOn = next;
  write(KEY.music, next);
}

export function setSfxPref(next: boolean): void {
  sfxOn = next;
  write(KEY.sfx, next);
}

/** Whether each channel should currently make any sound at all. */
export function musicSilenced(): boolean {
  return !musicOn;
}

export function sfxSilenced(): boolean {
  return !sfxOn;
}
