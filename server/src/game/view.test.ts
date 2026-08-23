import { describe, expect, it } from 'vitest';
import type { GameState, Piece } from 'shared';
import { toClientView } from './view.js';

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
  };
}

describe('toClientView: fog of war', () => {
  it('never leaks an unrevealed opponent piece kind, hand, or characterId', () => {
    const own: Piece = {
      id: 'red-soldier-0', team: 'red', kind: 'soldier', hand: 'rock',
      characterId: 'op_bennet', position: { row: 3, col: 3 }, revealed: false, alive: true,
    };
    const hiddenEnemy: Piece = {
      id: 'blue-soldier-0', team: 'blue', kind: 'soldier', hand: 'paper',
      characterId: 'co_aryederi', position: { row: 4, col: 3 }, revealed: false, alive: true,
    };
    const revealedEnemy: Piece = {
      id: 'blue-soldier-1', team: 'blue', kind: 'soldier', hand: 'scissors',
      characterId: 'co_smotrich', position: { row: 4, col: 4 }, revealed: true, alive: true,
    };
    const state = makeState([own, hiddenEnemy, revealedEnemy]);

    const view = toClientView(state, 'red');

    const seenHidden = view.pieces.find((p) => p.id === 'blue-soldier-0')!;
    expect(seenHidden.kind).toBeUndefined();
    expect(seenHidden.hand).toBeUndefined();
    expect(seenHidden.characterId).toBeUndefined();
    expect(seenHidden.team).toBe('blue');
    expect(seenHidden.position).toEqual({ row: 4, col: 3 });

    const seenOwn = view.pieces.find((p) => p.id === 'red-soldier-0')!;
    expect(seenOwn.kind).toBe('soldier');
    expect(seenOwn.hand).toBe('rock');
    expect(seenOwn.characterId).toBe('op_bennet');

    const seenRevealed = view.pieces.find((p) => p.id === 'blue-soldier-1')!;
    expect(seenRevealed.kind).toBe('soldier');
    expect(seenRevealed.hand).toBe('scissors');
    expect(seenRevealed.characterId).toBe('co_smotrich');

    // Serialize like the wire actually does — JSON.stringify drops `undefined` keys entirely,
    // so this is the real guarantee: no hidden-piece secret key survives on the wire at all.
    const raw = JSON.parse(JSON.stringify(view));
    const rawHidden = raw.pieces.find((p: { id: string }) => p.id === 'blue-soldier-0');
    expect('kind' in rawHidden).toBe(false);
    expect('hand' in rawHidden).toBe(false);
    expect('characterId' in rawHidden).toBe(false);
  });

  it('always reveals a dead piece regardless of who owned it', () => {
    const deadEnemy: Piece = {
      id: 'blue-soldier-0', team: 'blue', kind: 'soldier', hand: 'paper',
      characterId: 'co_aryederi', position: { row: 4, col: 3 }, revealed: true, alive: false,
    };
    const view = toClientView(makeState([deadEnemy]), 'red');
    const seen = view.pieces.find((p) => p.id === 'blue-soldier-0')!;
    expect(seen.alive).toBe(false);
    expect(seen.characterId).toBe('co_aryederi');
  });

  it('never leaks the opponent\'s tie-break pick before both sides have chosen', () => {
    const state = makeState([]);
    state.tieBreak = {
      attackerId: 'red-soldier-0',
      defenderId: 'blue-soldier-0',
      picks: { red: 'rock', blue: null },
      deadline: 123456,
    };

    const redView = toClientView(state, 'red');
    expect(redView.tieBreak).toEqual({
      attackerId: 'red-soldier-0',
      defenderId: 'blue-soldier-0',
      deadline: 123456,
      yourPick: 'rock',
      opponentPicked: false,
    });

    const blueView = toClientView(state, 'blue');
    expect(blueView.tieBreak).toEqual({
      attackerId: 'red-soldier-0',
      defenderId: 'blue-soldier-0',
      deadline: 123456,
      yourPick: null,
      opponentPicked: true, // blue can see red HAS picked, never what red picked
    });

    const raw = JSON.parse(JSON.stringify(blueView));
    expect(raw.tieBreak.yourPick).toBeNull();
    expect('picks' in raw.tieBreak).toBe(false); // the raw picks map itself never crosses the wire
  });
});
