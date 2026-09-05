import { useEffect, useState } from 'react';
import { currentPrefs, savePrefs } from '../utils/audioPrefs';
import { play, preload } from '../utils/sfx';
import './SplashScreen.css';

/** The art deserves a beat even on a fast connection, so the loader never flashes past. */
const MIN_LOADING_MS = 1400;
/** ...and never holds the player hostage to a stalled request either. */
const MAX_LOADING_MS = 7000;
const FADE_OUT_MS = 400;

/** What "loaded" actually means: the two images the very next screen paints. Everything else the
 *  game needs is fetched later, when a match starts (see utils/preloadAssets). */
const MENU_ART = ['/assets/background.webp', '/assets/logo.webp'];

interface SplashScreenProps {
  onDone: () => void;
}

function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    // Resolve on failure too: a missing image is the menu's problem to render around, not a reason
    // to strand someone on the splash.
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
}

/**
 * Sits over everything while the menu's art loads, then offers the way in.
 *
 * The press matters beyond navigation: browsers refuse to start an AudioContext or play an <audio>
 * element until the user has interacted, so this is the gesture that lets the game make any sound
 * at all. That is why the two toggles live here rather than in a settings screen — the moment the
 * player says "start" is the only moment their choice can actually be acted on.
 */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const [ready, setReady] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [prefs, setPrefs] = useState(currentPrefs);

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    const floor = new Promise((r) => setTimeout(r, MIN_LOADING_MS));
    void Promise.all([...MENU_ART.map(loadImage), floor]).then(finish);
    // Whatever happens to those requests, the button appears.
    const ceiling = setTimeout(finish, MAX_LOADING_MS);
    return () => clearTimeout(ceiling);
  }, []);

  useEffect(() => {
    if (!fadingOut) return;
    const timer = setTimeout(onDone, FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [fadingOut, onDone]);

  const start = () => {
    if (fadingOut) return;
    // All three inside the click: the browser grants audio permission to the gesture itself, not
    // to code that runs a moment later.
    savePrefs(prefs);
    preload();
    play('ui.tap');
    setFadingOut(true);
  };

  return (
    <div className={`splash-screen${fadingOut ? ' splash-screen-fading' : ''}`}>
      <picture>
        {/* A wide crop of the same poster. Without it `cover` would show a narrow vertical band of
            the portrait art — logo cropped, and none of the empty path the controls sit on. */}
        <source media="(orientation: landscape)" srcSet="/assets/splash-landscape.webp" />
        <img src="/assets/splash3.webp" alt="" className="splash-image" />
      </picture>

      {/* Sits in the open stretch of path below the logo, where the art is deliberately empty. */}
      <div className="splash-controls">
        {ready ? (
          <>
            <button type="button" className="splash-play" onClick={start} aria-label="התחילו לשחק">
              <img src="/assets/play.webp" alt="" />
            </button>
            <div className="splash-toggles">
              <SplashToggle
                label="מוזיקת רקע"
                on={prefs.music}
                onToggle={() => setPrefs((p) => ({ ...p, music: !p.music }))}
              />
              <SplashToggle
                label="צלילים"
                on={prefs.sfx}
                onToggle={() => setPrefs((p) => ({ ...p, sfx: !p.sfx }))}
              />
            </div>
          </>
        ) : (
          <div className="splash-loader">
            <span className="splash-spinner" />
            <span className="splash-loading-text">טוען...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** A labelled switch. `role="switch"` rather than a styled checkbox so the on/off state is
 *  announced, since the knob's position is the only visual cue. */
function SplashToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`splash-toggle${on ? ' splash-toggle-on' : ''}`}
      onClick={onToggle}
    >
      <span className="splash-toggle-track">
        <span className="splash-toggle-knob" />
      </span>
      <span className="splash-toggle-label">{label}</span>
    </button>
  );
}
