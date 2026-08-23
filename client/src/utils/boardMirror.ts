import { BOARD_COLS, BOARD_ROWS } from 'shared';
import type { Position, Team } from 'shared';

/**
 * The board is mirrored per player: each player's own zone always renders at the bottom of
 * their own screen. Blue sees the board as server coordinates define it; red sees it rotated
 * 180 degrees. The transform is its own inverse, so the same function converts both ways.
 */
export function mirrorPosition(pos: Position, team: Team): Position {
  if (team === 'blue') return pos;
  return { row: BOARD_ROWS - 1 - pos.row, col: BOARD_COLS - 1 - pos.col };
}
