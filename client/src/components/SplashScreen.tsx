import { useEffect, useState } from 'react';
import './SplashScreen.css';

const MIN_DISPLAY_MS = 6000;
const FADE_OUT_MS = 400;

interface SplashScreenProps {
  onDone: () => void;
}

/** Shown on top of the app for at least MIN_DISPLAY_MS while everything else mounts and preloads
 * underneath — fades out and unmounts itself once that minimum has passed. */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), MIN_DISPLAY_MS);
    return () => clearTimeout(fadeTimer);
  }, []);

  useEffect(() => {
    if (!fadingOut) return;
    const doneTimer = setTimeout(onDone, FADE_OUT_MS);
    return () => clearTimeout(doneTimer);
  }, [fadingOut, onDone]);

  return (
    <div className={`splash-screen${fadingOut ? ' splash-screen-fading' : ''}`}>
      <img src="/assets/splash2.webp" alt="" className="splash-image" />
      <div className="splash-loader">
        <span className="splash-spinner" />
        <span className="splash-loading-text">טוען...</span>
      </div>
    </div>
  );
}
