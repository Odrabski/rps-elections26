import type { GameEvent, Team } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { GameOverEffects } from './GameOverEffects';
import './GameOverScreen.css';

interface GameOverScreenProps {
  winner: Team;
  you: Team;
  /** Why the game ended — changes the detail line (e.g. no-moves-left vs. a captured king). */
  reason: GameEvent | null;
  onRematch: () => void;
  onBackToLobby: () => void;
}

export function GameOverScreen({ winner, you, reason, onRematch, onBackToLobby }: GameOverScreenProps) {
  const theme = TEAM_THEME[winner];
  const won = winner === you;

  // No sting here any more: the result screen has its own looping track (see music.ts), and a
  // one-shot on top of it fired at exactly the moment the loop started.
  const detail =
    // Only the opponent ever sees a resignation: exiting resigns and then leaves, which clears the
    // room and puts the resigner on the home screen before this could render. If exit ever stops
    // leaving, this needs its losing half back.
    reason?.type === 'resigned'
      ? 'היריב שלך פרש מהחיים הפוליטיים'
      : reason?.type === 'no-moves-left'
        ? won
          ? 'ליריב שלך אין יותר אפשרויות לזוז'
          : 'סונדלת, אין לך יותר אפשרויות לזוז'
        : won
          ? 'העפת את המלך מכיסא השלטון וניצחת בבחירות'
          : `${theme.label} מצאה את המלך\nולקחה את הבחירות`;

  return (
    <div className="gameover-screen">
      <GameOverEffects winner={winner} won={won} />
      <div className="gameover-panel panel">
        <div className="gameover-emoji">{won ? '🏆' : '🏳️'}</div>
        <h1 className="gradient-heading">{won ? 'קולולו! ניצחת' : 'הפסדתם'}</h1>
        <p className="gameover-detail" style={{ color: theme.text }}>
          {detail}
        </p>
        <div className="gameover-actions">
          <button type="button" className="btn-secondary btn-with-icon" onClick={onBackToLobby}>
            {/* First in the DOM, which in this RTL layout puts it at the start of the words. */}
            <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.2 11.2 12 4l8.8 7.2" />
              <path d="M5.6 9.8V20h12.8V9.8" />
              <path d="M9.8 20v-5.2h4.4V20" />
            </svg>
            <span>לך הביתה</span>
          </button>
          <button type="button" className="btn-primary btn-with-icon" onClick={onRematch}>
            {/* Replaces a 🔁, which rendered as a coloured emoji at whatever the device's font
                decided — this takes the button's own near-black ink like every other button glyph. */}
            <svg className="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.4 12a8.4 8.4 0 1 1-2.7-6.2" />
              <path d="M20.7 4.3v4.4h-4.4" />
            </svg>
            <span>סבב נוסף?</span>
          </button>
        </div>
      </div>
    </div>
  );
}
