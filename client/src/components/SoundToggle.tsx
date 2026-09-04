import { useState } from 'react';
import { isMuted, play, setMuted } from '../utils/sfx';
import './SoundToggle.css';

/**
 * Mute control. Deliberately a small, permanent fixture rather than something buried in a settings
 * screen the game doesn't have — a player who wants the sound off usually wants it off *now*.
 */
export function SoundToggle() {
  const [off, setOff] = useState(isMuted);

  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label={off ? 'הפעלת צלילים' : 'השתקת צלילים'}
      aria-pressed={off}
      onClick={() => {
        const next = !off;
        setMuted(next);
        setOff(next);
        // Unmuting confirms itself; muting can't, and doesn't need to.
        if (!next) play('ui.tap');
      }}
    >
      {off ? '🔇' : '🔊'}
    </button>
  );
}
