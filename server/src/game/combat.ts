import type { GameEvent, GameState, Piece, Position, RPSHand } from 'shared';
import { samePosition } from './board.js';

export const BEATS: Record<RPSHand, RPSHand> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
};

/**
 * Applies an already-validated move (see movement.ts) to the board: relocates the attacker,
 * and resolves combat if the destination holds an enemy piece. Mutates `state` in place and
 * returns the event describing what happened, if anything notable did.
 *
 * A piece's identity/hand is only revealed by an actual 1:1 fight — moving to an empty tile
 * alone never reveals it, so it stays disguised until it actually engages.
 *
 * A tied clash does NOT resolve here — it only flags a tie-break (see tiebreak.ts), which the
 * caller (Room) is responsible for setting up. Neither piece moves or dies until that resolves.
 */
export function applyMove(state: GameState, attacker: Piece, to: Position): GameEvent | null {
  const defender = Object.values(state.pieces).find((p) => p.alive && samePosition(p.position, to));

  if (!defender) {
    attacker.position = to;
    return null;
  }

  // Combat always reveals both participants, regardless of outcome.
  attacker.revealed = true;
  defender.revealed = true;

  if (defender.kind === 'king') {
    // Deliberately does NOT end the phase here. The capture is decided — the winner is set, and
    // the king is off the board — but the room holds 'playing' for KING_CAPTURE_SEQUENCE_MS so the
    // soldier's jump onto the tile actually plays before the result screen takes over. Ending it
    // here meant the move and the game-over arrived in one broadcast and the soldier never
    // visibly moved.
    defender.alive = false;
    attacker.position = to;
    state.winner = attacker.team;
    return { type: 'king-captured', winner: attacker.team };
  }

  if (defender.kind === 'trap') {
    // One-time use: the trap is spent along with whoever triggered it, not just the attacker.
    attacker.alive = false;
    defender.alive = false;
    return { type: 'trap-triggered', attackerId: attacker.id, trapId: defender.id };
  }

  // Soldier vs. soldier: Rock/Paper/Scissors.
  const attackerHand = attacker.hand as RPSHand;
  const defenderHand = defender.hand as RPSHand;

  if (attackerHand === defenderHand) {
    return { type: 'tie-break-started', attackerId: attacker.id, defenderId: defender.id };
  }

  if (BEATS[attackerHand] === defenderHand) {
    defender.alive = false;
    attacker.position = to;
    return { type: 'battle', attackerId: attacker.id, defenderId: defender.id, outcome: 'attacker-wins' };
  }

  attacker.alive = false;
  return { type: 'battle', attackerId: attacker.id, defenderId: defender.id, outcome: 'defender-wins' };
}
