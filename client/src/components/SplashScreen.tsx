import { useEffect, useState } from 'react';
import { play, preload } from '../utils/sfx';
import './SplashScreen.css';

/** How long before the way in is offered. The art is worth a beat, and the preloads underneath
 *  want the time. */
const READY_AFTER_MS = 2200;
const FADE_OUT_MS = 400;

interface SplashScreenProps {
  onDone: () => void;
}

/**
 * Sits on top of everything while the app mounts and preloads underneath, and waits for a tap.
 *
 * It used to dismiss itself on a timer, which was the reason the menu opened in silence: browsers
 * refuse to start an AudioContext or play an <audio> element until the user has interacted with
 * the page, and a screen that leaves by itself never gives them that. The button is that
 * interaction, so the effects and the menu track are both allowed the instant it is pressed
 * rather than whenever the player happens to touch something later.
 */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const [ready, setReady] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), READY_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!fadingOut) return;
    const doneTimer = setTimeout(onDone, FADE_OUT_MS);
    return () => clearTimeout(doneTimer);
  }, [fadingOut, onDone]);

  const enter = () => {
    if (fadingOut) return;
    // Both of these need to happen inside the click itself: the browser grants the audio
    // permission to the gesture, not to the code that runs a moment afterwards.
    preload();
    play('ui.tap');
    setFadingOut(true);
  };

  return (
    <div className={`splash-screen${fadingOut ? ' splash-screen-fading' : ''}`}>
      <picture>
        <source media="(orientation: landscape)" srcSet="/assets/splash-landscape.webp" />
        <img src="/assets/splash2.webp" alt="" className="splash-image" />
      </picture>

      {/* High up, in the sky above the artwork. The label is painted into the sign art, so the
          button itself is only a hit target and the accessible name has to be spelled out. */}
      <button
        type="button"
        className={`splash-enter${ready ? ' splash-enter-ready' : ''}`}
        onClick={enter}
        disabled={!ready}
        aria-label="יאללה כבר!"
      >
        <img src="/assets/yalla.webp" alt="" className="splash-enter-sign" />
      </button>

      {!ready && (
        <div className="splash-loader">
          <span className="splash-spinner" />
          <span className="splash-loading-text">טוען...</span>
        </div>
      )}
    </div>
  );
}
