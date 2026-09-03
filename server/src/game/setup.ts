import { balancedHandPool, BOARD_COLS, ZONE_ROWS } from 'shared';
import type { GameState, Piece, Position, RPSHand, Team } from 'shared';
import { isInOwnZone, samePosition, zoneTiles } from './board.js';
import { shuffleInPlace, shuffled } from '../util/random.js';

export interface TeamSetupData {
  /** Permutation of balancedHandPool(); handOrder[i] is the hand for the i-th soldier once finalized. */
  handOrder: RPSHand[];
  ready: boolean;
}

export function createInitialSetupData(): TeamSetupData {
  // balancedHandPool() itself is deliberately unshuffled (4 rock, then 4 paper, then 4
  // scissors) — shuffle it here so the very first auto-finalized layout is already random,
  // not just after the player manually hits "shuffle".
  return { handOrder: shuffleInPlace(balancedHandPool()), ready: false };
}

export function pieceId(team: Team, index: number): string {
  return `${team}-piece-${index}`;
}

/**
 * Creates all 14 of a team's pieces at once, occupying every tile in their zone, all
 * `'unassigned'` — no weapon, no role decided yet. Called once when setup begins, so both
 * players' full armies exist and are visible (fog-of-war filtered) from turn one; King/Trap
 * are designated in place from among these, never placed into a previously-empty tile.
 */
export function initializeTeamPieces(state: GameState, team: Team): void {
  const tiles = zoneTiles(team);
  tiles.forEach((position, i) => {
    const id = pieceId(team, i);
    state.pieces[id] = {
      id,
      team,
      kind: 'unassigned',
      hand: null,
      characterId: `${team}-piece`,
      position,
      revealed: false,
      alive: true,
    };
  });
}

export type SetupError =
  | 'not-setup-phase'
  | 'already-ready'
  | 'out-of-zone'
  | 'not-unassigned'
  | 'role-already-taken'
  | 'specials-not-placed';

function teamPieces(state: GameState, team: Team): Piece[] {
  return Object.values(state.pieces).filter((p) => p.team === team);
}

/** Designates one of the team's existing (still-unassigned) pieces as King or Trap. */
export function placeSpecial(
  state: GameState,
  setupData: Record<Team, TeamSetupData>,
  team: Team,
  which: 'king' | 'trap',
  position: Position
): SetupError | null {
  if (state.phase !== 'setup') return 'not-setup-phase';
  const data = setupData[team];
  if (data.ready) return 'already-ready';
  if (!isInOwnZone(team, position)) return 'out-of-zone';

  const pieces = teamPieces(state, team);
  const piece = pieces.find((p) => samePosition(p.position, position));
  if (!piece || piece.kind !== 'unassigned') return 'not-unassigned';
  if (pieces.some((p) => p.kind === which)) return 'role-already-taken';

  piece.kind = which;
  piece.characterId = which === 'king' ? `${team}-king` : 'trap';

  finalizeSoldiersIfReady(state, setupData, team);
  return null;
}

/** Once both King and Trap exist for a team, gives the rest a balanced rock/paper/scissors hand. */
function finalizeSoldiersIfReady(state: GameState, setupData: Record<Team, TeamSetupData>, team: Team): void {
  const pieces = teamPieces(state, team);
  const hasKing = pieces.some((p) => p.kind === 'king');
  const hasTrap = pieces.some((p) => p.kind === 'trap');
  if (!hasKing || !hasTrap) return;

  const data = setupData[team];
  pieces
    .filter((p) => p.kind === 'unassigned')
    .forEach((p, i) => {
      p.kind = 'soldier';
      p.hand = data.handOrder[i];
      p.characterId = `${team}-soldier`;
    });
}

export function shuffleHands(
  state: GameState,
  setupData: Record<Team, TeamSetupData>,
  team: Team
): SetupError | null {
  if (state.phase !== 'setup') return 'not-setup-phase';
  const data = setupData[team];
  if (data.ready) return 'already-ready';

  const soldiers = teamPieces(state, team).filter((p) => p.kind === 'soldier');
  if (soldiers.length === 0) return 'specials-not-placed';

  shuffleInPlace(data.handOrder);
  soldiers.forEach((p, i) => {
    p.hand = data.handOrder[i];
  });
  return null;
}

export function markReady(
  state: GameState,
  setupData: Record<Team, TeamSetupData>,
  team: Team
): SetupError | null {
  if (state.phase !== 'setup') return 'not-setup-phase';
  const data = setupData[team];
  if (data.ready) return 'already-ready';

  const pieces = teamPieces(state, team);
  const hasKing = pieces.some((p) => p.kind === 'king');
  const hasTrap = pieces.some((p) => p.kind === 'trap');
  if (!hasKing || !hasTrap) return 'specials-not-placed';

  data.ready = true;
  state.readiness[team] = true;
  return null;
}

/** Called when the setup timer expires; fills in anything the player never confirmed. */
export function autoFinalizeTeam(state: GameState, setupData: Record<Team, TeamSetupData>, team: Team): void {
  const data = setupData[team];
  if (data.ready) return;

  const pieces = teamPieces(state, team);
  const hasKing = pieces.some((p) => p.kind === 'king');
  const hasTrap = pieces.some((p) => p.kind === 'trap');

  if (!hasKing || !hasTrap) {
    const candidates = shuffled(pieces.filter((p) => p.kind === 'unassigned'));
    if (!hasKing) {
      const king = takeWeighted(candidates, (p) => kingTileWeight(team, p.position));
      if (king) {
        king.kind = 'king';
        king.characterId = `${team}-king`;
      }
    }
    if (!hasTrap) {
      const trap = takeWeighted(candidates, (p) => trapTileWeight(team, p.position));
      if (trap) {
        trap.kind = 'trap';
        trap.characterId = 'trap';
      }
    }
  }

  shuffleInPlace(data.handOrder);
  finalizeSoldiersIfReady(state, setupData, team);
  data.ready = true;
  state.readiness[team] = true;
}

/** The rank of `team`'s zone furthest from its opponent, and the one nearest. */
function backRow(team: Team): number {
  const [start, end] = ZONE_ROWS[team];
  return team === 'red' ? start : end;
}

function frontRow(team: Team): number {
  const [start, end] = ZONE_ROWS[team];
  return team === 'red' ? end : start;
}

/**
 * How strongly an auto-placed king should prefer a given tile.
 *
 * Placement used to be uniform over the whole zone, which put the king on the exposed front rank
 * half the time — and since a king is captured simply by an enemy stepping onto it, that decided
 * a lot of games early. The back rank is strictly safer: an attacker has to cross the entire board
 * to reach it, and it has one fewer square to be approached from (a back-rank corner has only two,
 * against a front-rank tile's four).
 *
 * Weighted rather than deterministic on purpose. A king always tucked in the same corner is a king
 * every opponent learns to go straight for, so this leans heavily without ever being predictable.
 */
function kingTileWeight(team: Team, position: Position): number {
  let weight = 1;
  if (position.row === backRow(team)) weight *= 8;
  if (position.col === 0 || position.col === BOARD_COLS - 1) weight *= 2;
  return weight;
}

/** A trap is bait: it kills whatever steps on it, so it wants to be where the enemy arrives first,
 * which is the opposite end of the zone from the king. */
function trapTileWeight(team: Team, position: Position): number {
  return position.row === frontRow(team) ? 4 : 1;
}

/** Removes and returns one element, chosen at random in proportion to `weight`. */
function takeWeighted<T>(items: T[], weight: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map(weight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items.splice(i, 1)[0];
  }
  return items.pop();
}
