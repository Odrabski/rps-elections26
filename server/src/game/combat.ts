import type { GameEvent, GameState, Piece, Position, RPSHand } from 'shared';
import { samePosition } from './board.js';

/**
 * Lifts the fog off both sides' King and Trap. Called only once the game is decided — never during
 * play, where the whole design rests on those two being indistinguishable from an ordinary soldier
 * (a Trap survives being sprung, and one everybody can see is just a tile everybody walks around).
 *
 * `revealed` is the entire mechanism: view.ts sends a piece's `kind` to its owner or to anyone once
 * this flag is set, so there is nothing else to change.
 */
export function revealSpecials(state: GameState): void {
  for (const piece of Object.values(state.pieces)) {
    if (piece.kind === 'king' || piece.kind === 'trap') piece.revealed = true;
  }
}

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

  if (defender.kind === 'trap') {
    // The trap is NOT spent. Only whoever triggered it dies; the trap stays on the board, at full
    // strength, and can be sprung again any number of times.
    //
    // Deliberately placed above the blanket reveal below, because the trap must not be revealed:
    // view.ts only sends a piece's `kind` to its owner or once `revealed` is set, so leaving that
    // flag alone is the entire disguise. To the opponent the tile goes on holding the same
    // anonymous body and head it held before, which is the point — a trap everyone can see is a
    // tile everyone walks around, which is the same as not having one.
    attacker.revealed = true;
    attacker.alive = false;
    // The bot's stand-in for having watched it happen (see bot.ts). Not secret — both players saw
    // the soldier die here — but nothing else on the server remembers it.
    if (!state.sprungTrapTiles.some((p) => samePosition(p, to))) {
      state.sprungTrapTiles.push({ ...to });
    }
    return { type: 'trap-triggered', attackerId: attacker.id, trapId: defender.id };
  }

  // Every other kind of combat reveals both participants, regardless of outcome.
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
    // It is over, so both sides finally get to see who the King and the Trap actually were. Set
    // here rather than when the phase flips, so it rides the broadcast that still says 'playing'
    // and the board can show it during the capture beat.
    revealSpecials(state);
    return { type: 'king-captured', winner: attacker.team };
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
