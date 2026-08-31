import { balancedHandPool, BOARD_ROWS } from 'shared';
import type { BotDifficulty, GameState, Position, RPSHand, Team } from 'shared';
import { findRandomLegalMove, legalMovesFor } from './movement.js';
import { BEATS } from './combat.js';

/** The hand that beats each hand — the reverse of BEATS (which maps a hand to what *it* beats). */
const LOSES_TO: Record<RPSHand, RPSHand> = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

const HANDS: RPSHand[] = ['rock', 'paper', 'scissors'];

/**
 * Chooses the bot's move for its turn. Never reads a piece's true `hand`, or an unrevealed
 * piece's `kind`, unless it belongs to the bot's own team — the bot only ever acts on
 * information a human player in its seat could also see. The one narrow exception is checking
 * *whether* the enemy's king is still alive and unrevealed at all (see `hasAliveUnrevealedKing`)
 * — that's not hidden information, just the logical fact that an ongoing game's king is always
 * exactly that; a human in the same seat could reason the same way.
 */
export function chooseBotMove(
  state: GameState,
  team: Team,
  difficulty: BotDifficulty,
): { pieceId: string; to: Position } | null {
  if (difficulty === 'easy') return findRandomLegalMove(state, team);

  const candidates = legalMovesFor(state, team);
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = -Infinity;
  const residual = difficulty === 'hard' ? residualHandCounts(state, otherTeam(team)) : null;

  for (const candidate of candidates) {
    const score = scoreMove(state, team, candidate, residual) + Math.random() * 0.01; // random tie-break
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Chooses the bot's tie-break pick. Uniform random at every difficulty: once both sides pick
 * fresh hands simultaneously and blind, there is no exploitable public information left — random
 * is already the game-theoretically sound choice, not a gap in the "hard" difficulty.
 */
export function chooseBotTiePick(_state: GameState, _team: Team, _difficulty: BotDifficulty): RPSHand {
  return HANDS[Math.floor(Math.random() * HANDS.length)];
}

function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

function scoreMove(
  state: GameState,
  team: Team,
  move: { pieceId: string; to: Position },
  residual: Record<RPSHand, number> | null,
): number {
  const attacker = state.pieces[move.pieceId];
  const defender = Object.values(state.pieces).find(
    (p) => p.alive && p.position.row === move.to.row && p.position.col === move.to.col,
  );

  if (!defender) {
    // An empty tile: mildly prefer advancing into the opponent's half over shuffling in place.
    const advancement = team === 'red' ? move.to.row : BOARD_ROWS - 1 - move.to.row;
    return advancement * 0.5;
  }

  if (!defender.revealed) {
    // As long as the enemy's king is still alive it's always unrevealed too (the game ends the
    // instant it's captured) — so every unrevealed defender carries a real 1-in-N chance of
    // *being* that king, which the plain "cautious about the unknown"/hand-odds estimate below
    // completely ignores on its own. Blending that chance in is what stops the bot from treating
    // a move onto the king exactly like any other risky guess and shying away from it.
    const unrevealedCount = countAliveUnrevealed(state, defender.team);
    const pKing = hasAliveUnrevealedKing(state, defender.team) && unrevealedCount > 0 ? 1 / unrevealedCount : 0;
    const fallback = residual ? residualExpectedValue(attacker.hand as RPSHand, residual) : -2;
    return pKing * 100 + (1 - pKing) * fallback;
  }

  if (defender.kind === 'king') return 100; // always a guaranteed, instant win
  if (defender.kind === 'trap') return -100; // always a guaranteed, pointless loss

  const attackerHand = attacker.hand as RPSHand;
  const defenderHand = defender.hand as RPSHand;
  if (BEATS[attackerHand] === defenderHand) return 10; // favorable — captures
  if (attackerHand === defenderHand) return 1; // a tie, not a loss
  return -10; // unfavorable — avoid
}

/** Whether `team` still has a living, unrevealed king on the board. */
function hasAliveUnrevealedKing(state: GameState, team: Team): boolean {
  return Object.values(state.pieces).some((p) => p.team === team && p.alive && !p.revealed && p.kind === 'king');
}

/** How many of `team`'s pieces are still alive and unrevealed right now — its king always among
 * them (while the game continues), plus its trap if not yet sprung, plus whichever soldiers
 * haven't fought yet. */
function countAliveUnrevealed(state: GameState, team: Team): number {
  let count = 0;
  for (const piece of Object.values(state.pieces)) {
    if (piece.team === team && piece.alive && !piece.revealed) count++;
  }
  return count;
}

/** How many of each hand remain among `team`'s soldiers that have never been revealed yet —
 * public information, derivable by any player from the fixed, balanced hand pool and whichever
 * of that team's soldiers have already fought (revealing is permanent, win or lose). */
function residualHandCounts(state: GameState, team: Team): Record<RPSHand, number> {
  const counts: Record<RPSHand, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const hand of balancedHandPool()) counts[hand]++;
  for (const piece of Object.values(state.pieces)) {
    if (piece.team === team && piece.kind === 'soldier' && piece.revealed && piece.hand) {
      counts[piece.hand]--;
    }
  }
  return counts;
}

function residualExpectedValue(attackerHand: RPSHand, residual: Record<RPSHand, number>): number {
  const total = residual.rock + residual.paper + residual.scissors;
  if (total === 0) return -2; // nothing left hidden to reason about — fall back to cautious

  const winCount = residual[BEATS[attackerHand]];
  const loseCount = residual[LOSES_TO[attackerHand]];
  const tieCount = residual[attackerHand];

  const pWin = winCount / total;
  const pLose = loseCount / total;
  const pTie = tieCount / total;

  return pWin * 3 - pLose * 3 + pTie * 0.5;
}
