import { describe, expect, it } from 'vitest';
import type { GameState, Piece } from 'shared';
import { findRandomLegalMove, legalMovesFor, validateMove } from './movement.js';

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomCode: 'TEST',
    phase: 'playing',
    pieces: {},
    turn: 'red',
    setupDeadline: null,
    turnDeadline: null,
    tieBreak: null,
    readiness: { red: true, blue: true },
    winner: null,
    lastEvent: null,
    lastMove: null,
    resolvingUntil: null,
    ...overrides,
  };
}

function piece(overrides: Partial<Piece> & Pick<Piece, 'id' | 'team' | 'position'>): Piece {
  return { kind: 'soldier', hand: 'rock', characterId: 'x', revealed: false, alive: true, ...overrides };
}

describe('validateMove', () => {
  it('rejects moves outside the playing phase', () => {
    const state = baseState({ phase: 'setup' });
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('wrong-phase');
  });

  it('rejects moving when it is not your turn', () => {
    const state = baseState({ turn: 'blue' });
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('not-your-turn');
  });

  it('rejects moving an unknown piece id', () => {
    const state = baseState();
    expect(validateMove(state, 'red', 'ghost', { row: 3, col: 4 })).toBe('unknown-piece');
  });

  it("rejects moving the opponent's piece", () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'blue', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('not-your-piece');
  });

  it('rejects moving a dead piece', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 }, alive: false });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('piece-dead');
  });

  it('rejects moving a king or trap — they never move', () => {
    const state = baseState();
    state.pieces.k = piece({ id: 'k', team: 'red', position: { row: 0, col: 0 }, kind: 'king', hand: null });
    state.pieces.t = piece({ id: 't', team: 'red', position: { row: 0, col: 1 }, kind: 'trap', hand: null });
    expect(validateMove(state, 'red', 'k', { row: 1, col: 0 })).toBe('immobile-piece');
    expect(validateMove(state, 'red', 't', { row: 1, col: 1 })).toBe('immobile-piece');
  });

  it('rejects moves off the board', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 0, col: 0 } });
    expect(validateMove(state, 'red', 'a', { row: -1, col: 0 })).toBe('out-of-bounds');
  });

  it('rejects diagonal moves', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 4, col: 4 })).toBe('not-adjacent');
  });

  it('rejects two-tile jumps', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 5, col: 3 })).toBe('not-adjacent');
  });

  it('rejects moving onto your own piece', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    state.pieces.b = piece({ id: 'b', team: 'red', position: { row: 3, col: 4 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('occupied-by-own-piece');
  });

  it('allows a legal one-tile orthogonal move onto an empty tile', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBeNull();
  });

  it('allows moving onto an enemy-occupied tile (combat is resolved separately)', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    state.pieces.b = piece({ id: 'b', team: 'blue', position: { row: 3, col: 4 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBeNull();
  });

  it('rejects any move while a tie-break is pending', () => {
    const state = baseState({
      tieBreak: { attackerId: 'x', defenderId: 'y', picks: { red: null, blue: null }, deadline: Date.now(), round: 1 },
    });
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('tie-break-in-progress');
  });

  it('rejects a move while a battle or trap is still resolving on the board', () => {
    // `turn` has already flipped to red (that's how the cinematic knows who's up next), so red
    // would otherwise pass every other check and get to move mid-fight.
    const state = baseState({ turn: 'red', resolvingUntil: Date.now() + 5000 });
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });

    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBe('resolving');
  });

  it('allows the move again once the resolve window has passed', () => {
    const state = baseState({ turn: 'red', resolvingUntil: Date.now() - 1 });
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });

    expect(validateMove(state, 'red', 'a', { row: 3, col: 4 })).toBeNull();
  });
});

describe('legalMovesFor / findRandomLegalMove', () => {
  it('lists every legal one-tile move for a team', () => {
    const state = baseState();
    // Isolated soldier in the middle of the board: 4 orthogonal moves, all legal.
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    const moves = legalMovesFor(state, 'red');
    expect(moves).toHaveLength(4);
    expect(moves.every((m) => m.pieceId === 'a')).toBe(true);
  });

  it('excludes moves that would land on a friendly piece', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    state.pieces.b = piece({ id: 'b', team: 'red', position: { row: 3, col: 4 } });
    const moves = legalMovesFor(state, 'red');
    expect(moves.some((m) => m.pieceId === 'a' && m.to.row === 3 && m.to.col === 4)).toBe(false);
  });

  it('returns null when the team has no legal move', () => {
    const state = baseState();
    // A king can't move at all, and there are no soldiers.
    state.pieces.k = piece({ id: 'k', team: 'red', position: { row: 0, col: 0 }, kind: 'king', hand: null });
    expect(findRandomLegalMove(state, 'red')).toBeNull();
  });

  it('returns one of the legal moves when some exist', () => {
    const state = baseState();
    state.pieces.a = piece({ id: 'a', team: 'red', position: { row: 3, col: 3 } });
    const move = findRandomLegalMove(state, 'red');
    expect(move).not.toBeNull();
    expect(move!.pieceId).toBe('a');
    expect(validateMove(state, 'red', move!.pieceId, move!.to)).toBeNull();
  });
});
