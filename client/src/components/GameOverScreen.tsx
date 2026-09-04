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
          : `${theme.label} מצאו את המלך ולקחו את הבחירות`;

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
          <button type="button" className="btn-secondary" onClick={onBackToLobby}>
            חזרה למזנון הכנסת
          </button>
          <button type="button" className="btn-primary" onClick={onRematch}>
            🔁 סבב נוסף?
          </button>
        </div>
      </div>
    </div>
  );
}
