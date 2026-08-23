import type { ClientPieceView, Team } from 'shared';
import { resolvePieceVisual } from '../data/characterAssets';
import './PieceView.css';

interface PieceViewProps {
  piece: ClientPieceView;
  team: Team;
  selected?: boolean;
}

export function PieceView({ piece, team, selected }: PieceViewProps) {
  const { asset, maskAsset, maskId, name } = resolvePieceVisual(piece, team);
  const isMine = piece.team === team;

  return (
    <div
      className={[
        'piece-view',
        `team-${piece.team}`,
        isMine ? 'piece-mine' : '',
        piece.alive ? '' : 'piece-dead',
        selected ? 'piece-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={name}
    >
      <img src={asset} alt={name} className="piece-portrait" draggable={false} />
      {maskAsset && (
        <img
          src={maskAsset}
          alt=""
          className={['piece-mask', maskId ? `piece-mask-${maskId}` : ''].filter(Boolean).join(' ')}
          draggable={false}
        />
      )}
    </div>
  );
}
