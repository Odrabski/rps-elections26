import { SOLDIER_COUNT, balancedHandPool } from 'shared';
import type { GameState, Position, RPSHand, Team } from 'shared';
import { isInOwnZone, samePosition, zoneTiles } from './board.js';
import { shuffleInPlace, shuffled } from '../util/random.js';

export interface TeamSetupData {
  kingPos: Position | null;
  trapPos: Position | null;
  /** Permutation of balancedHandPool(); handOrder[i] is the hand for soldier slot i. */
  handOrder: RPSHand[];
  ready: boolean;
}

export function createInitialSetupData(): TeamSetupData {
  return { kingPos: null, trapPos: null, handOrder: balancedHandPool(), ready: false };
}

export function kingId(team: Team): string {
  return `${team}-king`;
}

export function trapId(team: Team): string {
  return `${team}-trap`;
}

export function soldierId(team: Team, index: number): string {
  return `${team}-soldier-${index}`;
}

export type SetupError =
  | 'not-setup-phase'
  | 'already-ready'
  | 'out-of-zone'
  | 'overlaps-other-special'
  | 'specials-not-placed';

/** Placing King or Trap is sequential: King first, then Trap — see the `step` derivation client-side. */
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

  const other = which === 'king' ? data.trapPos : data.kingPos;
  if (other && samePosition(other, position)) return 'overlaps-other-special';

  if (which === 'king') data.kingPos = position;
  else data.trapPos = position;

  // The 12 soldiers only get shuffled onto the board once both King and Trap are placed.
  applyTeamLayout(state, setupData, team);
  return null;
}

export function shuffleHands(
  state: GameState,
  setupData: Record<Team, TeamSetupData>,
  team: Team
): SetupError | null {
  if (state.phase !== 'setup') return 'not-setup-phase';
  const data = setupData[team];
  if (data.ready) return 'already-ready';
  if (!data.kingPos || !data.trapPos) return 'specials-not-placed';

  shuffleInPlace(data.handOrder);
  applyTeamLayout(state, setupData, team);
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
  if (!data.kingPos || !data.trapPos) return 'specials-not-placed';

  data.ready = true;
  state.readiness[team] = true;
  return null;
}

/** Called when the setup timer expires; fills in anything the player never confirmed. */
export function autoFinalizeTeam(
  state: GameState,
  setupData: Record<Team, TeamSetupData>,
  team: Team
): void {
  const data = setupData[team];
  if (data.ready) return;

  if (!data.kingPos || !data.trapPos) {
    const tiles = shuffled(zoneTiles(team));
    const king = data.kingPos ?? tiles[0];
    const trap = data.trapPos ?? tiles.find((t) => !samePosition(t, king)) ?? tiles[1];
    data.kingPos = king;
    data.trapPos = trap;
  }
  shuffleInPlace(data.handOrder);

  applyTeamLayout(state, setupData, team);
  data.ready = true;
  state.readiness[team] = true;
}

/** Rebuilds this team's King/Trap/soldier Piece objects in state.pieces from setupData. */
function applyTeamLayout(state: GameState, setupData: Record<Team, TeamSetupData>, team: Team): void {
  const data = setupData[team];

  if (data.kingPos) {
    state.pieces[kingId(team)] = {
      id: kingId(team),
      team,
      kind: 'king',
      hand: null,
      characterId: `${team}-king`,
      position: data.kingPos,
      revealed: false,
      alive: true,
    };
  }

  if (data.trapPos) {
    state.pieces[trapId(team)] = {
      id: trapId(team),
      team,
      kind: 'trap',
      hand: null,
      characterId: 'trap',
      position: data.trapPos,
      revealed: false,
      alive: true,
    };
  }

  if (data.kingPos && data.trapPos) {
    const occupied = [data.kingPos, data.trapPos];
    const freeTiles = zoneTiles(team).filter((tile) => !occupied.some((o) => samePosition(o, tile)));

    // Regular soldiers are anonymous — no individual character portrait, just team + hand.
    for (let i = 0; i < SOLDIER_COUNT; i++) {
      const id = soldierId(team, i);
      state.pieces[id] = {
        id,
        team,
        kind: 'soldier',
        hand: data.handOrder[i],
        characterId: `${team}-soldier`,
        position: freeTiles[i],
        revealed: false,
        alive: true,
      };
    }
  } else {
    // Both specials aren't placed yet, so soldier tiles aren't determined — clear any stale ones.
    for (let i = 0; i < SOLDIER_COUNT; i++) delete state.pieces[soldierId(team, i)];
  }
}
