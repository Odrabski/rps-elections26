import { describe, expect, it } from 'vitest';
import type { GameState, Piece, RPSHand } from 'shared';
import { applyMove } from './combat.js';

function makeState(pieces: Piece[]): GameState {
  const map: Record<string, Piece> = {};
  for (const p of pieces) map[p.id] = p;
  return {
    roomCode: 'TEST',
    phase: 'playing',
    pieces: map,
    turn: 'red',
    setupDeadline: null,
    turnDeadline: null,
    tieBreak: null,
    readiness: { red: true, blue: true },
    winner: null,
    lastEvent: null,
    lastMove: null,
    resolvingUntil: null,
  };
}

function soldier(id: string, team: 'red' | 'blue', hand: RPSHand, row: number, col: number): Piece {
  return { id, team, kind: 'soldier', hand, characterId: id, position: { row, col }, revealed: false, alive: true };
}

describe('applyMove: RPS soldier combat', () => {
  const decisive: Array<[RPSHand, RPSHand, 'attacker-wins' | 'defender-wins']> = [
    ['rock', 'scissors', 'attacker-wins'],
    ['scissors', 'paper', 'attacker-wins'],
    ['paper', 'rock', 'attacker-wins'],
    ['rock', 'paper', 'defender-wins'],
    ['paper', 'scissors', 'defender-wins'],
    ['scissors', 'rock', 'defender-wins'],
  ];

  for (const [attackerHand, defenderHand, outcome] of decisive) {
    it(`${attackerHand} vs ${defenderHand} -> ${outcome}`, () => {
      const attacker = soldier('a', 'red', attackerHand, 3, 3);
      const defender = soldier('d', 'blue', defenderHand, 3, 4);
      const state = makeState([attacker, defender]);

      const event = applyMove(state, attacker, { row: 3, col: 4 });

      expect(event).toEqual({ type: 'battle', attackerId: 'a', defenderId: 'd', outcome });
      expect(attacker.revealed).toBe(true);
      expect(defender.revealed).toBe(true);

      if (outcome === 'attacker-wins') {
        expect(attacker.alive).toBe(true);
        expect(attacker.position).toEqual({ row: 3, col: 4 });
        expect(defender.alive).toBe(false);
      } else {
        expect(attacker.alive).toBe(false);
        expect(attacker.position).toEqual({ row: 3, col: 3 });
        expect(defender.alive).toBe(true);
      }
    });
  }

  const ties: RPSHand[] = ['rock', 'paper', 'scissors'];
  for (const hand of ties) {
    it(`${hand} vs ${hand} -> starts a tie-break instead of resolving`, () => {
      const attacker = soldier('a', 'red', hand, 3, 3);
      const defender = soldier('d', 'blue', hand, 3, 4);
      const state = makeState([attacker, defender]);

      const event = applyMove(state, attacker, { row: 3, col: 4 });

      expect(event).toEqual({ type: 'tie-break-started', attackerId: 'a', defenderId: 'd' });
      // Neither piece has moved or died — combat is suspended until the tie-break resolves.
      expect(attacker.alive).toBe(true);
      expect(defender.alive).toBe(true);
      expect(attacker.position).toEqual({ row: 3, col: 3 });
      expect(defender.position).toEqual({ row: 3, col: 4 });
      // Both are revealed even though the clash itself is unresolved.
      expect(attacker.revealed).toBe(true);
      expect(defender.revealed).toBe(true);
    });
  }
});

describe('applyMove: trap and king', () => {
  it('attacking a trap is one-time use — it eliminates the attacker and is spent itself', () => {
    const attacker = soldier('a', 'red', 'rock', 3, 3);
    const trap: Piece = {
      id: 'blue-trap', team: 'blue', kind: 'trap', hand: null,
      characterId: 'op_abbas', position: { row: 3, col: 4 }, revealed: false, alive: true,
    };
    const state = makeState([attacker, trap]);

    const event = applyMove(state, attacker, { row: 3, col: 4 });

    expect(event).toEqual({ type: 'trap-triggered', attackerId: 'a', trapId: 'blue-trap' });
    expect(attacker.alive).toBe(false);
    expect(trap.alive).toBe(false);
    expect(trap.position).toEqual({ row: 3, col: 4 });
    expect(trap.revealed).toBe(true);
  });

  it('moving onto the enemy king wins the game instantly', () => {
    const attacker = soldier('a', 'red', 'rock', 3, 3);
    const king: Piece = {
      id: 'blue-king', team: 'blue', kind: 'king', hand: null,
      characterId: 'co_bibi', position: { row: 3, col: 4 }, revealed: false, alive: true,
    };
    const state = makeState([attacker, king]);

    const event = applyMove(state, attacker, { row: 3, col: 4 });

    expect(event).toEqual({ type: 'king-captured', winner: 'red' });
    expect(state.phase).toBe('gameover');
    expect(state.winner).toBe('red');
    expect(attacker.position).toEqual({ row: 3, col: 4 });
  });

  it('a free move onto an empty tile does not reveal the mover — only a 1:1 fight does', () => {
    const attacker = soldier('a', 'red', 'rock', 3, 3);
    const state = makeState([attacker]);

    const event = applyMove(state, attacker, { row: 3, col: 4 });

    expect(event).toBeNull();
    expect(attacker.position).toEqual({ row: 3, col: 4 });
    expect(attacker.revealed).toBe(false);
  });
});
