import { describe, expect, it } from 'vitest';
import type { GameState, Piece } from 'shared';
import { autoFillTiePicks, startTieBreak, submitTiePick, tryResolveTieBreak } from './tiebreak.js';

function soldier(id: string, team: 'red' | 'blue', row: number, col: number): Piece {
  return {
    id, team, kind: 'soldier', hand: 'rock', characterId: id,
    position: { row, col }, revealed: true, alive: true,
  };
}

function makeState(attacker: Piece, defender: Piece): GameState {
  return {
    roomCode: 'TEST',
    phase: 'playing',
    pieces: { [attacker.id]: attacker, [defender.id]: defender },
    turn: attacker.team,
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

describe('tie-break flow', () => {
  it('waits for both picks before resolving', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    expect(tryResolveTieBreak(state)).toBeNull();
    expect(submitTiePick(state, 'red', 'rock')).toBeNull();
    expect(tryResolveTieBreak(state)).toBeNull(); // still waiting on blue
  });

  it('rejects a second pick from the same side', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    submitTiePick(state, 'red', 'rock');
    expect(submitTiePick(state, 'red', 'paper')).toBe('already-picked');
  });

  it('rejects a pick when no tie-break is pending', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    expect(submitTiePick(state, 'red', 'rock')).toBe('no-tie-break');
  });

  it('a decisive re-pick eliminates the loser and moves the winner onto the tile', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    submitTiePick(state, 'red', 'rock');
    submitTiePick(state, 'blue', 'scissors');
    const event = tryResolveTieBreak(state);

    expect(event).toEqual({ type: 'battle', attackerId: 'a', defenderId: 'd', outcome: 'attacker-wins' });
    expect(state.tieBreak).toBeNull();
    expect(defender.alive).toBe(false);
    expect(attacker.alive).toBe(true);
    expect(attacker.position).toEqual({ row: 3, col: 4 });
    // Both fixtures start at 'rock' — defender's re-pick ('scissors') must replace it, not just
    // decide the outcome, or the piece (and anything rendered from it) keeps showing the stale hand.
    expect(attacker.hand).toBe('rock');
    expect(defender.hand).toBe('scissors');
  });

  it('a repeated tie resets picks and extends the deadline instead of resolving', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');
    const firstDeadline = state.tieBreak!.deadline;

    submitTiePick(state, 'red', 'paper');
    submitTiePick(state, 'blue', 'paper');
    const event = tryResolveTieBreak(state);

    expect(event).toEqual({ type: 'tie-break-repeat', attackerId: 'a', defenderId: 'd', round: 2 });
    expect(state.tieBreak).not.toBeNull();
    expect(state.tieBreak!.picks).toEqual({ red: null, blue: null });
    expect(state.tieBreak!.deadline).toBeGreaterThanOrEqual(firstDeadline);
    expect(attacker.alive).toBe(true);
    expect(defender.alive).toBe(true);
    // Both fixtures start at 'rock' — the repeat's 'paper'/'paper' pick must replace it, so the
    // next fight-sequence replay shows what was actually just chosen, not the original tied hand.
    expect(attacker.hand).toBe('paper');
    expect(defender.hand).toBe('paper');
  });

  it('autoFillTiePicks only fills sides that have not picked yet', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');
    submitTiePick(state, 'red', 'rock');

    autoFillTiePicks(state);

    expect(state.tieBreak!.picks.red).toBe('rock'); // untouched
    expect(state.tieBreak!.picks.blue).not.toBeNull(); // auto-filled
  });
});
