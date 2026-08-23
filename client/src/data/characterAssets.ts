import {
  HIDDEN_BODY_ASSET,
  HIDDEN_HEAD_POOL,
  KING_ASSET,
  KING_NAME,
  SOLDIER_BACK_ASSET,
  SOLDIER_BACK_EXPOSED_ASSET,
  SOLDIER_HAND_ASSET,
  TRAP_ASSET,
} from 'shared';
import type { ClientPieceView, RPSHand, Team } from 'shared';

/** Body-only placeholder (no head) — used for the small setup-screen "unassigned" bench icons. */
export function hiddenPieceAsset(team: Team): string {
  return `/assets/pieces/${HIDDEN_BODY_ASSET[team]}`;
}

/** An opponent's soldier once its weapon is revealed to this viewer — front-facing, team + held hand. */
export function soldierHandAsset(team: Team, hand: RPSHand): string {
  return `/assets/pieces/${SOLDIER_HAND_ASSET[team][hand]}`;
}

/** Your own soldier, back-facing — `exposed` once that piece has actually fought. */
function soldierBackAsset(team: Team, hand: RPSHand, exposed: boolean): string {
  const table = exposed ? SOLDIER_BACK_EXPOSED_ASSET : SOLDIER_BACK_ASSET;
  return `/assets/pieces/${table[team][hand]}`;
}

// Simple string hash so a piece's "random" disguise head is stable across re-renders/broadcasts
// (the same piece always shows the same head) without the server needing to track it.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A per-piece-stable random head from the team's rank-and-file pool. */
function hiddenHeadAsset(team: Team, pieceId: string): { asset: string; id: string } {
  const pool = HIDDEN_HEAD_POOL[team];
  const file = pool[hashString(pieceId) % pool.length];
  return { asset: `/assets/pieces/${file}`, id: file.replace(/\.png$/, '') };
}

/** A piece's head portrait, regardless of ownership — used where a face is wanted even for
 * your own soldier (e.g. the tie-break popup), which otherwise never shows a face on the board. */
export function pieceHeadAsset(piece: ClientPieceView): string {
  return hiddenHeadAsset(piece.team, piece.id).asset;
}

export interface PieceVisual {
  asset: string;
  /** A head layered over `asset`'s neckline — only set for unrevealed pieces. */
  maskAsset?: string;
  /** The head portrait's filename stem (e.g. "op_lazimi") — lets CSS target per-portrait sizing. */
  maskId?: string;
  name: string;
}

/**
 * The single source of truth for how to render a piece — used by PieceView, combat/tie UI
 * alike. King (crowned, per-team) and Trap (a neutral wooden decoy) are always shown as
 * themselves. A soldier's rendering is viewer-relative: your own soldiers stand back-to-camera
 * and show their real weapon from the start (an "exposed" variant once that piece has actually
 * fought), while an opponent's soldier only shows its weapon, front-facing, once revealed by an
 * actual 1:1 fight — moving alone doesn't reveal it. Until an opponent piece is revealed to this
 * viewer, it renders as a headless decoy body wearing its real (persistent) head, so a hidden
 * King/Trap/soldier are indistinguishable from one another, but not anonymous.
 */
export function resolvePieceVisual(piece: ClientPieceView, viewerTeam: Team): PieceVisual {
  const known = piece.kind !== undefined;
  const isMine = piece.team === viewerTeam;

  if (known && piece.kind === 'soldier' && piece.hand) {
    if (isMine) {
      return { asset: soldierBackAsset(piece.team, piece.hand, piece.revealed), name: 'חייל' };
    }
    const head = hiddenHeadAsset(piece.team, piece.id);
    return {
      asset: soldierHandAsset(piece.team, piece.hand),
      maskAsset: head.asset,
      maskId: head.id,
      name: 'חייל',
    };
  }
  if (known && piece.kind === 'king') {
    return { asset: `/assets/pieces/${KING_ASSET[piece.team]}`, name: KING_NAME[piece.team] };
  }
  if (known && piece.kind === 'trap') {
    return { asset: `/assets/pieces/${TRAP_ASSET}`, name: 'מלכודת' };
  }
  const head = hiddenHeadAsset(piece.team, piece.id);
  return {
    asset: `/assets/pieces/${HIDDEN_BODY_ASSET[piece.team]}`,
    maskAsset: head.asset,
    maskId: head.id,
    name: '',
  };
}
