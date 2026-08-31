import type { ClientPieceView, GameEvent, Team } from 'shared';
import { FightSequence } from './FightSequence';
import './CombatOverlay.css';

interface CombatOverlayProps {
  event: GameEvent;
  pieces: ClientPieceView[];
  team: Team;
  seed: string;
}

export function CombatOverlay({ event, pieces, team, seed }: CombatOverlayProps) {
  const findPiece = (id: string) => pieces.find((p) => p.id === id);

  if (event.type === 'tie-break-started' || event.type === 'tie-break-repeat') {
    const attacker = findPiece(event.attackerId);
    const defender = findPiece(event.defenderId);
    if (!attacker || !defender) return null;
    // Keyed by round (not just event type) so every repeat is a genuinely fresh mount — otherwise
    // a third+ tie in a row would reuse the same key as the second and never replay its animation.
    const key =
      event.type === 'tie-break-repeat'
        ? `${event.attackerId}-${event.defenderId}-tie-round-${event.round}`
        : `${event.attackerId}-${event.defenderId}-tie-round-1`;
    return (
      <div className="combat-overlay">
        <FightSequence key={key} attacker={attacker} defender={defender} outcome="tie" seed={seed} viewerTeam={team} />
      </div>
    );
  }

  if (event.type !== 'battle') return null;

  const attacker = findPiece(event.attackerId);
  const defender = findPiece(event.defenderId);
  if (!attacker || !defender) return null;

  return (
    <div className="combat-overlay">
      <FightSequence
        key={`${event.attackerId}-${event.defenderId}-${event.outcome}`}
        attacker={attacker}
        defender={defender}
        outcome={event.outcome}
        seed={seed}
        viewerTeam={team}
      />
    </div>
  );
}
