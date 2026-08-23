import { describe, expect, it } from 'vitest';
import type { GameState, Team } from 'shared';
import { SOLDIER_COUNT } from 'shared';
import {
  autoFinalizeTeam,
  createInitialSetupData,
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
  };
}

function freshSetupData(): Record<Team, TeamSetupData> {
  return { red: createInitialSetupData(), blue: createInitialSetupData() };
}

describe('placeSpecial', () => {
  it("rejects a position outside the team's own zone", () => {
    const state = freshState();
    const setupData = freshSetupData();
    // Red's zone is rows 0-1; row 2 is neutral no-man's-land.
    expect(placeSpecial(state, setupData, 'red', 'king', { row: 2, col: 0 })).toBe('out-of-zone');
  });

  it('rejects placing king and trap on the same tile', () => {
    const state = freshState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    expect(placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 0 })).toBe('overlaps-other-special');
  });

  it('lays out all 12 soldiers on the remaining zone tiles once king and trap are both placed', () => {
    const state = freshState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });

    const soldiers = Object.values(state.pieces).filter((p) => p.team === 'red' && p.kind === 'soldier');
    expect(soldiers).toHaveLength(SOLDIER_COUNT);

    const occupiedTiles = new Set(Object.values(state.pieces).map((p) => `${p.position.row},${p.position.col}`));
    expect(occupiedTiles.size).toBe(SOLDIER_COUNT + 2); // no overlaps
  });

  it('re-placing king after soldiers exist keeps soldier count stable and off the new king tile', () => {
    const state = freshState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });
    placeSpecial(state, setupData, 'red', 'king', { row: 1, col: 6 });

    const soldiers = Object.values(state.pieces).filter((p) => p.team === 'red' && p.kind === 'soldier');
    expect(soldiers).toHaveLength(SOLDIER_COUNT);
    expect(soldiers.some((s) => s.position.row === 1 && s.position.col === 6)).toBe(false);
  });
});

describe('shuffleHands', () => {
  it('refuses to shuffle before both specials are placed', () => {
    const state = freshState();
    const setupData = freshSetupData();
    expect(shuffleHands(state, setupData, 'red')).toBe('specials-not-placed');
  });

  it('keeps the same 4/4/4 multiset of hands after shuffling', () => {
    const state = freshState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'blue', 'king', { row: 4, col: 0 });
    placeSpecial(state, setupData, 'blue', 'trap', { row: 4, col: 1 });
    shuffleHands(state, setupData, 'blue');

    const hands = Object.values(state.pieces)
      .filter((p) => p.team === 'blue' && p.kind === 'soldier')
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
  it('refuses to ready up before king and trap are placed', () => {
    const state = freshState();
    const setupData = freshSetupData();
    expect(markReady(state, setupData, 'red')).toBe('specials-not-placed');
    expect(state.readiness.red).toBe(false);
  });

  it('marks the team ready once both specials are placed', () => {
    const state = freshState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });
    expect(markReady(state, setupData, 'red')).toBeNull();
    expect(state.readiness.red).toBe(true);
  });
});

describe('autoFinalizeTeam', () => {
  it('fills in a full random layout for a team that never placed anything', () => {
    const state = freshState();
    const setupData = freshSetupData();
    autoFinalizeTeam(state, setupData, 'red');

    expect(state.readiness.red).toBe(true);
    const redPieces = Object.values(state.pieces).filter((p) => p.team === 'red');
    expect(redPieces).toHaveLength(SOLDIER_COUNT + 2);
    expect(redPieces.every((p) => p.position.row === 0 || p.position.row === 1)).toBe(true);
  });

  it('does nothing to a team that already readied up', () => {
    const state = freshState();
    const setupData = freshSetupData();
    placeSpecial(state, setupData, 'red', 'king', { row: 0, col: 0 });
    placeSpecial(state, setupData, 'red', 'trap', { row: 0, col: 1 });
    markReady(state, setupData, 'red');
    const before = JSON.stringify(state.pieces);

    autoFinalizeTeam(state, setupData, 'red');

    expect(JSON.stringify(state.pieces)).toBe(before);
  });
});
