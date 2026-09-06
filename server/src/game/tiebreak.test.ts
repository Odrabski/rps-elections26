import { describe, expect, it } from 'vitest';
import type { GameState, Piece } from 'shared';
import {
  autoFillTiePicks,
  startTieBreak,
  submitTiePick,
  tryResolveTieBreak,
  TIE_BREAK_FIRST_WINDOW_MS,
  TIE_BREAK_REPEAT_WINDOW_MS,
} from './tiebreak.js';

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
    sprungTrapTiles: [],
  };
}

describe('tie-break flow', () => {
  it('waits for both picks before resolving', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    expect(tryResolveTieBreak(state)).toBeNull();
    expect(submitTiePick(state, 'red', 'rock', state.tieBreak!.round)).toBeNull();
    expect(tryResolveTieBreak(state)).toBeNull(); // still waiting on blue
  });

  it('rejects a second pick from the same side', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    submitTiePick(state, 'red', 'rock', state.tieBreak!.round);
    expect(submitTiePick(state, 'red', 'paper', state.tieBreak!.round)).toBe('already-picked');
  });

  it('rejects a pick made for a round that has already rolled over', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');
    // Both pick the same weapon, so the round repeats and both picks are cleared.
    submitTiePick(state, 'red', 'rock', 1);
    submitTiePick(state, 'blue', 'rock', 1);
    tryResolveTieBreak(state);
    expect(state.tieBreak?.round).toBe(2);

    // A tap sent from the round-1 panel, arriving after the rollover, must not become round 2's
    // pick — the player has not been shown round 2 yet.
    expect(submitTiePick(state, 'red', 'paper', 1)).toBe('stale-round');
    expect(state.tieBreak?.picks.red).toBeNull();
    expect(submitTiePick(state, 'red', 'paper', 2)).toBeNull();
  });

  it('rejects a pick when no tie-break is pending', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    expect(submitTiePick(state, 'red', 'rock', 1)).toBe('no-tie-break');
  });

  it('a decisive re-pick eliminates the loser and moves the winner onto the tile', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    submitTiePick(state, 'red', 'rock', state.tieBreak!.round);
    submitTiePick(state, 'blue', 'scissors', state.tieBreak!.round);
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

  it('gives a first tie a longer window than a repeat, to cover the jump beat', () => {
    // The picker is hidden until the clash cinematic finishes. A first tie plays the
    // jump-into-the-cloud beat first, so its window has to be longer by exactly that much or the
    // player is handed a countdown that's already partly spent.
    const state = makeState(soldier('a', 'red', 3, 3), soldier('d', 'blue', 3, 4));
    startTieBreak(state, 'a', 'd');

    const granted = state.tieBreak!.deadline - Date.now();
    expect(granted).toBeGreaterThan(TIE_BREAK_REPEAT_WINDOW_MS);
    expect(granted).toBeLessThanOrEqual(TIE_BREAK_FIRST_WINDOW_MS);
  });

  it('a repeated tie resets picks and extends the deadline instead of resolving', () => {
    const attacker = soldier('a', 'red', 3, 3);
    const defender = soldier('d', 'blue', 3, 4);
    const state = makeState(attacker, defender);
    startTieBreak(state, 'a', 'd');

    submitTiePick(state, 'red', 'paper', state.tieBreak!.round);
    submitTiePick(state, 'blue', 'paper', state.tieBreak!.round);
    const event = tryResolveTieBreak(state);

    expect(event).toEqual({ type: 'tie-break-repeat', attackerId: 'a', defenderId: 'd', round: 2 });
    expect(state.tieBreak).not.toBeNull();
    expect(state.tieBreak!.picks).toEqual({ red: null, blue: null });
    // A repeat gets a fresh window measured from now. It's deliberately *shorter* than a first
    // tie's (TIE_BREAK_FIRST_WINDOW_MS), which has to cover the jump-into-the-cloud beat as well
    // — so the meaningful check is that a full repeat window was granted, not that the absolute
    // deadline moved later than the original one.
    const grantedMs = state.tieBreak!.deadline - Date.now();
    expect(grantedMs).toBeGreaterThan(TIE_BREAK_REPEAT_WINDOW_MS - 1000);
    expect(grantedMs).toBeLessThanOrEqual(TIE_BREAK_REPEAT_WINDOW_MS);
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
    submitTiePick(state, 'red', 'rock', state.tieBreak!.round);

    autoFillTiePicks(state);

    expect(state.tieBreak!.picks.red).toBe('rock'); // untouched
    expect(state.tieBreak!.picks.blue).not.toBeNull(); // auto-filled
  });
});
