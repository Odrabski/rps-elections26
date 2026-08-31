import { balancedHandPool } from 'shared';
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
      const king = candidates.shift();
      if (king) {
        king.kind = 'king';
        king.characterId = `${team}-king`;
      }
    }
    if (!hasTrap) {
      const trap = candidates.shift();
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
