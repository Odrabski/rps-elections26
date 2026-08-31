import type { ReactNode } from 'react';
import type { ClientPieceView, Team } from 'shared';
import { TEAM_THEME } from '../data/theme';
import './ScoreHeader.css';

interface ScoreHeaderProps {
  team: Team;
  pieces: ClientPieceView[];
  /** Rendered in the middle column, between the two badges — e.g. the turn timer. */
  center?: ReactNode;
}

/** "Me" always renders on-screen left, the opponent on the right — rendered in that DOM order
 * since the page is RTL, where the first grid column lands at the right edge. The optional
 * `center` slot sits in its own grid track, so it's exactly centered regardless of how wide
 * either badge is (unlike relying on flex space-between with 3 children). */
export function ScoreHeader({ team, pieces, center }: ScoreHeaderProps) {
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const aliveCount = (side: Team) => pieces.filter((p) => p.team === side && p.alive).length;

  return (
    <div className="score-header">
      <ScoreSide side={opponent} count={aliveCount(opponent)} edge="right" />
      <div className="score-center">{center}</div>
      <ScoreSide side={team} count={aliveCount(team)} edge="left" />
    </div>
  );
}

function ScoreSide({ side, count, edge }: { side: Team; count: number; edge: 'left' | 'right' }) {
  const theme = TEAM_THEME[side];
  return (
    <div className="score-pill" style={{ background: theme.solid }}>
      <span className="score-pill-label">{theme.label}</span>
      <span className={`score-count-circle score-count-${edge}`} style={{ color: theme.solid }}>
        {count}
      </span>
    </div>
  );
}
