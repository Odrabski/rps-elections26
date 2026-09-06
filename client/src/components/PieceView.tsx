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

/**
 * The board's own copies of the art, at 320px (tools/build-piece-sprites.sh).
 *
 * The source files are 512x512 but a figure is painted at ~98 CSS px on a phone and ~185 on a
 * desktop — measured, not estimated. Decoding 58 of them at full size costs tens of megabytes of
 * resident bitmap, on exactly the devices least able to spare it.
 *
 * Shipped as a srcset so the browser decides: a phone at DPR 3 needs ~295px and takes the 320, a
 * desktop at DPR 2 needs ~370 and keeps the original. The memory is saved where it is scarce and
 * nothing gets softer where it isn't. `sizes` is measured to match the CSS above — get it wrong in
 * the generous direction and every device just takes the big file, which is only the status quo.
 *
 * PieceView is the board's alone; the fight cinematic and the menu peekers have their own markup
 * and keep the 512px art, which they need at 216-238 CSS px.
 */
const BOARD_SIZES = '(max-width: 600px) 23vw, 185px';

function boardSrcSet(asset: string): string {
  const small = asset.replace('/assets/pieces/', '/assets/pieces/320/');
  return `${small} 320w, ${asset} 512w`;
}

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
        srcSet={boardSrcSet(asset)}
        sizes={BOARD_SIZES}
        alt={name}
        className={['piece-portrait', mirrored ? 'piece-portrait-mirrored' : ''].filter(Boolean).join(' ')}
        draggable={false}
        decoding="async"
      />
      {maskAsset && (
        <img
          src={maskAsset}
          srcSet={boardSrcSet(maskAsset)}
          sizes={BOARD_SIZES}
          alt=""
          className={['piece-mask', maskId ? `piece-mask-${maskId}` : ''].filter(Boolean).join(' ')}
          draggable={false}
          decoding="async"
        />
      )}
    </div>
  );
}
