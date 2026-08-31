import { TIE_SEQUENCE_MS, TIE_BREAK_SECONDS } from 'shared';
import type { GameEvent, GameState, RPSHand, Team } from 'shared';
import { BEATS } from './combat.js';

export type TieBreakError = 'no-tie-break' | 'already-picked';

/** The weapon picker only appears on each client once its collision cinematic (the same one for
 * both the initial tie and every repeat) finishes playing, so the actual picking window — both
 * the deadline shown and the server's own auto-fill timeout — starts that much later too. */
export const TIE_BREAK_WINDOW_MS = TIE_SEQUENCE_MS + TIE_BREAK_SECONDS * 1000;

export function startTieBreak(state: GameState, attackerId: string, defenderId: string): void {
  state.tieBreak = {
    attackerId,
    defenderId,
    picks: { red: null, blue: null },
    deadline: Date.now() + TIE_BREAK_WINDOW_MS,
    round: 1,
  };
}

export function submitTiePick(state: GameState, team: Team, hand: RPSHand): TieBreakError | null {
  if (!state.tieBreak) return 'no-tie-break';
  if (state.tieBreak.picks[team]) return 'already-picked';
  state.tieBreak.picks[team] = hand;
  return null;
}

/** Auto-picks a random hand for any side that hasn't chosen yet (used on tie-break timeout). */
export function autoFillTiePicks(state: GameState): void {
  const tb = state.tieBreak;
  if (!tb) return;
  const kinds: RPSHand[] = ['rock', 'paper', 'scissors'];
  for (const team of ['red', 'blue'] as Team[]) {
    if (!tb.picks[team]) tb.picks[team] = kinds[Math.floor(Math.random() * kinds.length)];
  }
}

/**
 * Resolves the pending tie-break once both sides have picked: null if still waiting on a pick,
 * a 'tie-break-repeat' event (picks reset, deadline extended) if they tied again, or a decisive
 * 'battle' event once one side wins — mirroring normal combat's elimination/movement rules.
 */
export function tryResolveTieBreak(state: GameState): GameEvent | null {
  const tb = state.tieBreak;
  if (!tb) return null;

  const redPick = tb.picks.red;
  const bluePick = tb.picks.blue;
  if (!redPick || !bluePick) return null;

  const attacker = state.pieces[tb.attackerId];
  const defender = state.pieces[tb.defenderId];
  const attackerHand = tb.picks[attacker.team]!;
  const defenderHand = tb.picks[defender.team]!;

  // The tie-break pick replaces whichever hand caused the original tie — otherwise the piece
  // (and anything rendered from it, like the fight sequence) would keep showing the stale hand.
  attacker.hand = attackerHand;
  defender.hand = defenderHand;

  if (attackerHand === defenderHand) {
    tb.picks = { red: null, blue: null };
    tb.deadline = Date.now() + TIE_BREAK_WINDOW_MS;
    tb.round += 1;
    return { type: 'tie-break-repeat', attackerId: tb.attackerId, defenderId: tb.defenderId, round: tb.round };
  }

  state.tieBreak = null;

  if (BEATS[attackerHand] === defenderHand) {
    defender.alive = false;
    attacker.position = defender.position;
    return { type: 'battle', attackerId: attacker.id, defenderId: defender.id, outcome: 'attacker-wins' };
  }

  attacker.alive = false;
  return { type: 'battle', attackerId: attacker.id, defenderId: defender.id, outcome: 'defender-wins' };
}
