import type { Team } from 'shared';
import { TEAM_THEME } from '../data/theme';
import './GameOverScreen.css';

interface GameOverScreenProps {
  winner: Team;
  you: Team;
  onRematch: () => void;
  onBackToLobby: () => void;
}

export function GameOverScreen({ winner, you, onRematch, onBackToLobby }: GameOverScreenProps) {
  const theme = TEAM_THEME[winner];
  const won = winner === you;

  return (
    <div className="gameover-screen">
      <div className="gameover-panel panel">
        <div className="gameover-emoji">{won ? '🏆' : '🏳️'}</div>
        <h1 className="gradient-heading">{won ? 'ניצחתם!' : 'הפסדתם'}</h1>
        <p className="gameover-detail" style={{ color: theme.text }}>
          {theme.label} כבשו את המלך היריב
        </p>
        <div className="gameover-actions">
          <button type="button" className="btn-secondary" onClick={onBackToLobby}>
            חזרה ללובי
          </button>
          <button type="button" className="btn-primary" onClick={onRematch}>
            🔁 משחק חוזר
          </button>
        </div>
      </div>
    </div>
  );
}
