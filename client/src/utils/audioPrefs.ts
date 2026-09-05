/**
 * What the player wants to hear, and the one switch that overrides it.
 *
 * Three stored values, because "is this audible right now" is genuinely two questions:
 *
 *   music / sfx  — the mix, chosen on the splash before the game starts. Both default on.
 *   master mute  — the 🔊 button in the corner during play. One tap silences everything; tapping
 *                  back restores whatever the splash was set to, rather than turning everything on.
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
  /** Deliberately the old key. Anyone who muted the game before this split keeps their choice, and
   *  it still means the same thing: silence everything. */
  master: 'rps-politika:muted',
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

let musicOn = read(KEY.music, true);
let sfxOn = read(KEY.sfx, true);
let masterMuted = read(KEY.master, false);

/** The splash's toggles, as they should appear when it opens. */
export function currentPrefs(): { music: boolean; sfx: boolean } {
  return { music: musicOn, sfx: sfxOn };
}

/**
 * Stores the choice made on the splash. Also clears the master mute: pressing start is a deliberate
 * "play it like this", and leaving a mute from a previous visit in place would silently ignore both
 * toggles the player just set.
 */
export function savePrefs(next: { music: boolean; sfx: boolean }): void {
  musicOn = next.music;
  sfxOn = next.sfx;
  masterMuted = false;
  write(KEY.music, musicOn);
  write(KEY.sfx, sfxOn);
  write(KEY.master, false);
}

export function isMasterMuted(): boolean {
  return masterMuted;
}

export function setMasterMuted(next: boolean): void {
  masterMuted = next;
  write(KEY.master, next);
}

/** Whether each channel should currently make any sound at all. */
export function musicSilenced(): boolean {
  return masterMuted || !musicOn;
}

export function sfxSilenced(): boolean {
  return masterMuted || !sfxOn;
}
