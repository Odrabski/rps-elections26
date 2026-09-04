import { useState } from 'react';
import { isMuted, play, setMuted } from '../utils/sfx';
import { setMusicMuted } from '../utils/music';
import './SoundToggle.css';

interface SoundToggleProps {
  /**
   * Outside a match, an unheard game is worth calling attention to: the control grows and spells
   * out what it does. On the board it stays the small icon it has always been — a label sitting
   * over the pieces for a whole match is clutter, not an invitation.
   */
  prominent?: boolean;
}

/**
 * Mute control. Deliberately a small, permanent fixture rather than something buried in a settings
 * screen the game doesn't have — a player who wants the sound off usually wants it off *now*.
 *
 * The game starts muted (see readMuted in utils/sfx.ts), so this is also the only thing telling a
 * first-time visitor there is sound at all. It only asks while it is off: once someone has turned
 * it on, the label has nothing left to say and the button shrinks back to its icon.
 */
export function SoundToggle({ prominent = false }: SoundToggleProps) {
  const [off, setOff] = useState(isMuted);
  const asking = prominent && off;

  return (
    <button
      type="button"
      className={`sound-toggle${asking ? ' sound-toggle-asking' : ''}`}
      aria-label={off ? 'הפעלת צלילים' : 'השתקת צלילים'}
      aria-pressed={off}
      onClick={() => {
        const next = !off;
        setMuted(next);
        setMusicMuted(next);
        setOff(next);
        // Unmuting confirms itself; muting can't, and doesn't need to.
        if (!next) play('ui.tap');
      }}
    >
      <span className="sound-toggle-icon">{off ? '🔇' : '🔊'}</span>
      {/* Rendered only when asking, so the button has nothing to collapse *from* once sound is on
          and the layout never shifts underneath a second click. */}
      {asking && <span className="sound-toggle-label">הפעל סאונד!</span>}
    </button>
  );
}
