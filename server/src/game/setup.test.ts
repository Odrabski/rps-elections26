import { describe, expect, it } from 'vitest';
import type { GameState, Team } from 'shared';
import { SOLDIER_COUNT } from 'shared';
import {
  autoFinalizeTeam,
  createInitialSetupData,
  initializeTeamPieces,
  markReady,
  placeSpecial,
  shuffleHands,
  type TeamSetupData,
} from './setup.js';

function freshState(): GameState {
  return {
    roomCode: 'TEST',
    phase: 'setup',
    pieces: {},
    turn: null,
    setupDeadline: null,
    turnDeadline: null,
    tieBreak: null,
    readiness: { red: false, blue: false },
    winner: null,
    lastEvent: null,
    lastMove: null,
    resolvingUntil: null,
    sprungTrapTiles: [],
  };
}

/** Mirrors what Room.startSetupPhase does: both teams' 14 pieces exist from the start. */
function setupState(): GameState {
  const state = freshState();
  initializeTeamPieces(state, 'red');
  initializeTeamPieces(state, 'blue');
  return state;
}

function freshSetupData(): Record<Team, TeamSetupData> {
  return { red: createInitialSetupData(), blue: createInitialSetupData() };
}

function piecesOf(state: GameState, team: Team) {
  return Object.values(state.pieces).filter((p) => p.team === team);
}

describe('initializeTeamPieces', () => {
  it('creates 14 unassigned pieces occupying every tile in the zone', () => {
    const state = freshState();
    initializeTeamPieces(state, 'red');
    const pieces = piecesOf(state, 'red');

    expect(pieces).toHaveLength(14);
    expect(pieces.every((p) => p.kind === 'unassigned' && p.hand === null)).toBe(true);
    expect(pieces.every((p) => p.position.row === 0 || p.position.row === 1)).toBe(true);
    const occupied = new Set(pieces.map((p) => `${p.position.row},${p.position.col}`));
    expect(occupied.size).toBe(14); // no two pieces share a tile
  });
});

describe('placeSpecial', () => {
  it("rejects a position outside the team's own zone", () => {
    const state = setupState();
    const setupData = freshSetupData();
    // Red's zone is rows 0-1; row 2 is neutral no-man's-land.
    expect(placeSpecial(state, setupData, 'red', 'king', { row: 2, col: 0 })).toBe('out-of-zone');
  });

  it('designates the existing piece at that tile as king, without creating or moving anything', () => {
    const state = setupState();
    const setupData = freshSetupData();
    const before = piecesOf(state, 'red').length;

    expect(placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 })).toBeNull();

    const pieces = piecesOf(state, 'red');
    expect(pieces).toHaveLength(before); // still 14 — an existing piece was promoted, not a new one created
    const king = pieces.find((p) => p.kind === 'king');
    expect(king?.position).toEqual({ row: 0, col: 0 });
  });

  it('rejects re-designating a piece that already has a role', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    expect(placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 0 })).toBe('not-unassigned');
  });

  it('rejects a second piece claiming a role that is already taken', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    expect(placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 1 })).toBe('role-already-taken');
  });

  it('finalizes the remaining 12 pieces as soldiers only once king and trap are both designated', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    expect(piecesOf(state, 'red').some((p) => p.kind === 'soldier')).toBe(false); // trap still missing

    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });

    const pieces = piecesOf(state, 'red');
    expect(pieces).toHaveLength(14);
    expect(pieces.filter((p) => p.kind === 'soldier')).toHaveLength(SOLDIER_COUNT);
    expect(pieces.filter((p) => p.kind === 'unassigned')).toHaveLength(0);
  });
});

describe('shuffleHands', () => {
  it('refuses to shuffle before both specials are designated', () => {
    const state = setupState();
    const setupData = freshSetupData();
    expect(shuffleHands(state, setupData, 'red')).toBe('specials-not-placed');
  });

  it('reassigns hands without moving any piece, keeping the 4/4/4 multiset', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'blue', 'king', { row: 4, col: 0 });
    placeSpecial(state, setupData, 'blue', 'trap', { row: 4, col: 1 });

    const positionsBefore = piecesOf(state, 'blue')
      .map((p) => `${p.id}:${p.position.row},${p.position.col}`)
      .sort();

    shuffleHands(state, setupData, 'blue');

    const positionsAfter = piecesOf(state, 'blue')
      .map((p) => `${p.id}:${p.position.row},${p.position.col}`)
      .sort();
    expect(positionsAfter).toEqual(positionsBefore);

    const hands = piecesOf(state, 'blue')
      .filter((p) => p.kind === 'soldier')
      .map((p) => p.hand)
      .sort();
    expect(hands).toEqual([
      'paper', 'paper', 'paper', 'paper',
      'rock', 'rock', 'rock', 'rock',
      'scissors', 'scissors', 'scissors', 'scissors',
    ]);
  });
});

describe('markReady', () => {
  it('refuses to ready up before king and trap are designated', () => {
    const state = setupState();
    const setupData = freshSetupData();
    expect(markReady(state, setupData, 'red')).toBe('specials-not-placed');
    expect(state.readiness.red).toBe(false);
  });

  it('marks the team ready once both specials are designated', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });
    expect(markReady(state, setupData, 'red')).toBeNull();
    expect(state.readiness.red).toBe(true);
  });
});

describe('autoFinalizeTeam', () => {
  it('promotes two still-unassigned pieces to king and trap for a team that chose nothing', () => {
    const state = setupState();
    const setupData = freshSetupData();
    autoFinalizeTeam(state, setupData, 'red');

    expect(state.readiness.red).toBe(true);
    const pieces = piecesOf(state, 'red');
    expect(pieces).toHaveLength(SOLDIER_COUNT + 2);
    expect(pieces.filter((p) => p.kind === 'king')).toHaveLength(1);
    expect(pieces.filter((p) => p.kind === 'trap')).toHaveLength(1);
    expect(pieces.filter((p) => p.kind === 'soldier')).toHaveLength(SOLDIER_COUNT);
  });

  it('only fills in the missing role, preserving a role the player already chose', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 3 });

    autoFinalizeTeam(state, setupData, 'red');

    const pieces = piecesOf(state, 'red');
    const king = pieces.find((p) => p.kind === 'king');
    expect(king?.position).toEqual({ row: 0, col: 3 });
    expect(pieces.filter((p) => p.kind === 'trap')).toHaveLength(1);
  });

  it('does nothing to a team that already readied up', () => {
    const state = setupState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });
    markReady(state, setupData, 'red');
    const before = JSON.stringify(state.pieces);

    autoFinalizeTeam(state, setupData, 'red');

    expect(JSON.stringify(state.pieces)).toBe(before);
  });
});
