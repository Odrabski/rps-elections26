import { useEffect, useState } from 'react';
import './SplashScreen.css';

/** How long the art holds before the menu takes over, and how long it takes to fade once it does.
 *  The preloads underneath want most of this time anyway. */
const HOLD_MS = 5200;
const FADE_OUT_MS = 400;

interface SplashScreenProps {
  onDone: () => void;
}

/**
 * Sits on top of everything while the app mounts and preloads underneath, then leaves on its own.
 *
 * It used to wait for a tap, and that tap was load-bearing: browsers refuse to start an
 * AudioContext or play an <audio> element until the user has interacted with the page, so a screen
 * that dismissed itself left the menu silent. That is no longer true, because the game now opens
 * muted by default — the first sound anyone hears is the one they ask for by pressing the sound
 * toggle, and that press is itself the gesture the browser wants. With nothing left for a button
 * here to unlock, waiting for one was only ever asking people to tap past the art.
 */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const leave = setTimeout(() => setFadingOut(true), HOLD_MS);
    const done = setTimeout(onDone, HOLD_MS + FADE_OUT_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div className={`splash-screen${fadingOut ? ' splash-screen-fading' : ''}`}>
      <picture>
        <source media="(orientation: landscape)" srcSet="/assets/splash-landscape.webp" />
        <img src="/assets/splash2.webp" alt="" className="splash-image" />
      </picture>

      {/* Shown for the whole hold now, rather than until a button armed — there is nothing to wait
          for any more, so it is reporting progress rather than gating on it. */}
      <div className="splash-loader">
        <span className="splash-spinner" />
        <span className="splash-loading-text">טוען...</span>
      </div>
    </div>
  );
}
