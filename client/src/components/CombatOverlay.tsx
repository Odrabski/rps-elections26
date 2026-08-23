import type { ClientPieceView, GameEvent, Team } from 'shared';
import { pieceHeadAsset, resolvePieceVisual } from '../data/characterAssets';
import { TEAM_THEME } from '../data/theme';
import './CombatOverlay.css';

interface CombatOverlayProps {
  event: GameEvent;
  pieces: ClientPieceView[];
  team: Team;
}

export function CombatOverlay({ event, pieces, team }: CombatOverlayProps) {
  const findPiece = (id: string) => pieces.find((p) => p.id === id);

  if (event.type === 'trap-triggered') {
    const attacker = findPiece(event.attackerId);
    if (!attacker) return null;
    const { asset, name } = resolvePieceVisual(attacker, team);
    return (
      <div className="combat-overlay">
        <div className="combat-card">
          <div className="combat-portrait-wrap combat-portrait-loser combat-portrait-body">
            <img src={asset} alt={name} />
          </div>
          <div className="combat-result-text combat-result-trap">נפל/ה למלכודת! 🪤</div>
          <div className="combat-name">{TEAM_THEME[attacker.team].label}</div>
        </div>
      </div>
    );
  }

  if (event.type === 'tie-break-started' || event.type === 'tie-break-repeat') {
    const attacker = findPiece(event.attackerId);
    const defender = findPiece(event.defenderId);
    if (!attacker || !defender) return null;
    return (
      <div className="combat-overlay">
        <div className="combat-card">
          <div className="combat-portraits">
            <div className="combat-tie-head combat-portrait-loser">
              <img src={pieceHeadAsset(attacker)} alt="" />
            </div>
            <span className="combat-vs">מול</span>
            <div className="combat-tie-head combat-portrait-loser">
              <img src={pieceHeadAsset(defender)} alt="" />
            </div>
          </div>
          <div className="combat-result-text combat-result-tie">תיקו! בוא ננסה שוב</div>
        </div>
      </div>
    );
  }

  if (event.type !== 'battle') return null;

  const attacker = findPiece(event.attackerId);
  const defender = findPiece(event.defenderId);
  if (!attacker || !defender) return null;

  const attackerWon = event.outcome === 'attacker-wins';
  const winner = attackerWon ? attacker : defender;
  const loser = attackerWon ? defender : attacker;
  const winnerTheme = TEAM_THEME[winner.team as Team];
  const winnerVisual = resolvePieceVisual(winner, team);
  const loserVisual = resolvePieceVisual(loser, team);

  return (
    <div className="combat-overlay">
      <div className="combat-card">
        <div className="combat-portraits">
          <div
            className="combat-portrait-wrap combat-portrait-winner combat-portrait-body"
            style={{ borderColor: winnerTheme.solid }}
          >
            <img src={winnerVisual.asset} alt={winnerVisual.name} />
          </div>
          <span className="combat-vs">מול</span>
          <div className="combat-portrait-wrap combat-portrait-loser combat-portrait-body">
            <img src={loserVisual.asset} alt={loserVisual.name} />
          </div>
        </div>
        <div className="combat-result-text" style={{ color: winnerTheme.text }}>
          {winnerTheme.label} ניצח/ה!
        </div>
      </div>
    </div>
  );
}
