import type { GameState, Position, Team } from 'shared';
import { inBounds, isAdjacent, samePosition } from './board.js';

export type MoveError =
  | 'wrong-phase'
  | 'not-your-turn'
  | 'unknown-piece'
  | 'not-your-piece'
  | 'piece-dead'
  | 'immobile-piece'
  | 'out-of-bounds'
  | 'not-adjacent'
  | 'occupied-by-own-piece'
  | 'tie-break-in-progress'
  | 'resolving';

export function validateMove(state: GameState, team: Team, pieceId: string, to: Position): MoveError | null {
  if (state.phase !== 'playing') return 'wrong-phase';
  if (state.tieBreak) return 'tie-break-in-progress';
  // `turn` flips the instant combat starts so the cinematic knows who's up next, so being the
  // current player isn't enough on its own — the battle/trap still playing out on both boards
  // has to finish first, or pieces could be moved mid-fight.
  if (state.resolvingUntil !== null && Date.now() < state.resolvingUntil) return 'resolving';
  if (state.turn !== team) return 'not-your-turn';

  const piece = state.pieces[pieceId];
  if (!piece) return 'unknown-piece';
  if (piece.team !== team) return 'not-your-piece';
  if (!piece.alive) return 'piece-dead';
  if (piece.kind !== 'soldier') return 'immobile-piece'; // King and Trap never move

  if (!inBounds(to)) return 'out-of-bounds';
  if (!isAdjacent(piece.position, to)) return 'not-adjacent';

  const occupant = Object.values(state.pieces).find((p) => p.alive && samePosition(p.position, to));
  if (occupant && occupant.team === team) return 'occupied-by-own-piece';

  return null;
}

/** All legal {pieceId, to} moves currently available to `team` (used for turn-timeout auto-play). */
export function legalMovesFor(state: GameState, team: Team): { pieceId: string; to: Position }[] {
  const moves: { pieceId: string; to: Position }[] = [];
  const soldiers = Object.values(state.pieces).filter((p) => p.team === team && p.kind === 'soldier' && p.alive);

  for (const piece of soldiers) {
    const { row, col } = piece.position;
    const neighbors: Position[] = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];
    for (const to of neighbors) {
      if (validateMove(state, team, piece.id, to) === null) moves.push({ pieceId: piece.id, to });
    }
  }

  return moves;
}

/** A uniformly random legal move for `team`, or null if none exists (fully boxed in). */
export function findRandomLegalMove(state: GameState, team: Team): { pieceId: string; to: Position } | null {
  const moves = legalMovesFor(state, team);
  if (moves.length === 0) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}
