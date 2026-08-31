import type { ClientPieceView, Team } from 'shared';
import { resolvePieceVisual } from '../data/characterAssets';
import './PieceView.css';

interface PieceViewProps {
  piece: ClientPieceView;
  team: Team;
  seed: string;
  selected?: boolean;
  /** True when this tile is the board's rightmost on-screen column. The revealed rock/scissors
   * back sprites hold their weapon out far enough to one side that, mirrored or not, the sprite
   * would spill past the board's edge there — flipping it horizontally in that one column keeps
   * the outstretched arm pointing back in toward the board instead. */
  mirrorAtEdge?: boolean;
}

/** Only these two revealed-back sprites (per team) have the off-center weapon-arm that can spill
 * past the board edge — paper's held sprite stays centered enough not to need this. */
const EDGE_MIRROR_ASSET_RE = /_(?:rock|scissors)_x\.webp$/;

export function PieceView({ piece, team, seed, selected, mirrorAtEdge }: PieceViewProps) {
  const { asset, maskAsset, maskId, name } = resolvePieceVisual(piece, team, seed);
  const isMine = piece.team === team;
  const mirrored = Boolean(mirrorAtEdge) && EDGE_MIRROR_ASSET_RE.test(asset);

  return (
    <div
      className={[
        'piece-view',
        `team-${piece.team}`,
        isMine ? 'piece-mine' : '',
        piece.alive ? '' : 'piece-dead',
        selected ? 'piece-selected' : '',
        // Your own not-yet-designated pieces read as "not decided yet" during setup — King, Trap,
        // and (once both exist) the rest of the soldiers each snap to full color the moment
        // they're actually assigned a role.
        isMine && piece.kind === 'unassigned' ? 'piece-unassigned-dim' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={name}
    >
      <img
        src={asset}
        alt={name}
        className={['piece-portrait', mirrored ? 'piece-portrait-mirrored' : ''].filter(Boolean).join(' ')}
        draggable={false}
      />
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
