import { BOARD_COLS, BOARD_ROWS, ZONE_ROWS } from 'shared';
import type { Position, Team } from 'shared';

export function inBounds(pos: Position): boolean {
  return pos.row >= 0 && pos.row < BOARD_ROWS && pos.col >= 0 && pos.col < BOARD_COLS;
}

export function isInOwnZone(team: Team, pos: Position): boolean {
  const [start, end] = ZONE_ROWS[team];
  return pos.row >= start && pos.row <= end && pos.col >= 0 && pos.col < BOARD_COLS;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

export function isAdjacent(a: Position, b: Position): boolean {
  return manhattan(a, b) === 1;
}

/** All 14 tiles in a team's own placement zone, in row-major order. */
export function zoneTiles(team: Team): Position[] {
  const [start, end] = ZONE_ROWS[team];
  const tiles: Position[] = [];
  for (let row = start; row <= end; row++) {
    for (let col = 0; col < BOARD_COLS; col++) tiles.push({ row, col });
  }
  return tiles;
}
