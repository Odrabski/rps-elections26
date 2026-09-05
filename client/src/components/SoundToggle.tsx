import { useEffect, useRef, useState } from 'react';
import { currentPrefs } from '../utils/audioPrefs';
import { play, setSfxOn } from '../utils/sfx';
import { setMusicOn } from '../utils/music';
import { AudioToggle } from './AudioToggle';
import './SoundToggle.css';

/**
 * The audio menu: a small, permanent fixture in the corner rather than something buried in a
 * settings screen the game doesn't have — a player who wants the music off usually wants it off
 * *now*.
 *
 * It holds the same two switches the splash offers, because those are the only two things there
 * are to decide. The icon is a readout of them rather than a control of its own: both channels off
 * is what "muted" means, so that is when it shows the muted speaker — including on arrival, if
 * that is how the splash was left.
 */
export function SoundToggle() {
  const [prefs, setPrefs] = useState(currentPrefs);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // Capture, so a tap that lands on a tile closes the menu before the board acts on it.
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const silent = !prefs.music && !prefs.sfx;

  const toggleMusic = () => {
    const next = !prefs.music;
    setMusicOn(next);
    setPrefs((p) => ({ ...p, music: next }));
  };

  const toggleSfx = () => {
    const next = !prefs.sfx;
    setSfxOn(next);
    setPrefs((p) => ({ ...p, sfx: next }));
    // Switching effects on confirms itself with the very sound it just enabled; switching them off
    // can't, and doesn't need to.
    if (next) play('ui.tap');
  };

  return (
    <div className="sound-menu" ref={wrapRef}>
      <button
        type="button"
        className="sound-toggle"
        aria-label="הגדרות שמע"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sound-toggle-icon">{silent ? '🔇' : '🔊'}</span>
      </button>

      {open && (
        <div className="sound-menu-panel">
          <AudioToggle label="מוזיקת רקע" on={prefs.music} onToggle={toggleMusic} />
          <AudioToggle label="צלילים" on={prefs.sfx} onToggle={toggleSfx} />
        </div>
      )}
    </div>
  );
}
