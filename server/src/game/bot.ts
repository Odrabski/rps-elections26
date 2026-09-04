import { balancedHandPool, BOARD_ROWS } from 'shared';
import type { BotDifficulty, GameState, Piece, Position, RPSHand, Team } from 'shared';
import { findRandomLegalMove, legalMovesFor } from './movement.js';
import { isAdjacent } from './board.js';
import { BEATS } from './combat.js';

/** The hand that beats each hand — the reverse of BEATS (which maps a hand to what *it* beats). */
const LOSES_TO: Record<RPSHand, RPSHand> = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

const HANDS: RPSHand[] = ['rock', 'paper', 'scissors'];

/** An enemy standing next to a king is one move from ending the game outright, so answering that
 * has to outbid any ordinary capture or positional gain the same move could be spent on. */
const KING_DANGER = 30;

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

  const base = scoreOutcome(state, team, attacker, defender, move.to, residual);
  if (!residual) return base;

  // Hard only: everything below looks one ply past the immediate interaction, using nothing but
  // public information (which enemy pieces have been revealed, and where everything stands).
  const hand = attacker.hand as RPSHand;
  return (
    base +
    // Don't hand a piece straight back by parking it next to a revealed soldier known to beat it.
    exposurePenalty(state, team, hand, move.to, defender?.id) +
    // ...and do walk a piece *out* of that situation when it's already in one.
    escapeBonus(state, team, hand, attacker.position) +
    // Line up next turn's capture: end adjacent to a revealed soldier this piece beats.
    threatBonus(state, team, hand, move.to, defender?.id) +
    // Keep the squares around your own king plugged — an enemy can only take it by standing on
    // one of them, so an occupied neighbour is the only real protection there is — and answer an
    // enemy that has already reached one.
    kingDefenceDelta(state, team, attacker.position, move.to, defender, hand)
  );
}

function scoreOutcome(
  state: GameState,
  team: Team,
  attacker: Piece,
  defender: Piece | undefined,
  to: Position,
  residual: Record<RPSHand, number> | null,
): number {
  if (!defender) {
    // An empty tile: mildly prefer advancing into the opponent's half over shuffling in place.
    const advancement = team === 'red' ? to.row : BOARD_ROWS - 1 - to.row;
    return advancement * 0.5;
  }

  // A trap already sprung on this tile. It survived and was never revealed, so nothing about the
  // piece standing there gives it away — this is purely the bot remembering what it watched
  // happen, the way the human across the board does. Checked ahead of the unrevealed branch below,
  // which would otherwise treat the tile as an ordinary unknown and walk into it again.
  if (isSprungTrap(state, to)) return -100;

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

/** Penalizes ending a move next to an already-revealed enemy soldier whose known hand beats the
 * moving piece's hand — a real, public threat of losing it right back next turn, not a guess.
 * `excludeId` skips the piece just captured at `to` (it's dead, not a threat). */
function exposurePenalty(
  state: GameState,
  team: Team,
  attackerHand: RPSHand,
  to: Position,
  excludeId: string | undefined,
): number {
  return threatsAt(state, team, attackerHand, to, excludeId) * -8;
}

/** Moving a piece off a square where a revealed enemy soldier known to beat it is already
 * standing next door — the mirror image of `exposurePenalty`, which only judges the destination
 * and so can't tell "safe square" apart from "escaped a threat". */
function escapeBonus(state: GameState, team: Team, attackerHand: RPSHand, from: Position): number {
  return threatsAt(state, team, attackerHand, from, undefined) > 0 ? 6 : 0;
}

/** Ending the move next to a revealed enemy soldier this piece beats — a capture set up for next
 * turn, on a matchup that's already public. */
function threatBonus(
  state: GameState,
  team: Team,
  attackerHand: RPSHand,
  to: Position,
  excludeId: string | undefined,
): number {
  let bonus = 0;
  for (const piece of Object.values(state.pieces)) {
    if (piece.id === excludeId) continue;
    if (piece.team === team || !piece.alive || !piece.revealed || piece.kind !== 'soldier') continue;
    if (!isAdjacent(piece.position, to)) continue;
    if (BEATS[attackerHand] === piece.hand) bonus += 4;
  }
  return bonus;
}

/**
 * How this move affects the safety of the bot's own king.
 *
 * Kings never move (see movement.ts), so the square being defended is fixed for the whole game and
 * the entire problem is the four squares around it: an enemy captures the king by stepping onto one
 * of them and then onto the king, so a friendly piece parked there is the only thing that denies
 * the approach at all.
 *
 * The garrison weights are deliberately mild. Scaling them up with the number of enemies bearing
 * down on the king was the obvious idea, and measured consistently *worse* across a thousand
 * simulated games: almost every game is decided by one side finding the other's king first, so
 * pulling pieces home to turtle mostly cedes that race. Where the king actually gets protected is
 * at placement time — see `kingTileWeight` in setup.ts.
 */
function kingDefenceDelta(
  state: GameState,
  team: Team,
  from: Position,
  to: Position,
  defender: Piece | undefined,
  attackerHand: RPSHand,
): number {
  const king = Object.values(state.pieces).find((p) => p.team === team && p.kind === 'king' && p.alive);
  if (!king) return 0;

  const left = isAdjacent(from, king.position) ? -5 : 0;
  const joined = isAdjacent(to, king.position) ? 3 : 0;

  // Once an enemy actually stands on an approach square, garrisoning is beside the point — the
  // square is taken and the king falls next turn. Removing that piece is the only answer left,
  // which makes it worth gambling on an unknown hand. A *known* losing matchup is not: that just
  // donates a soldier and leaves the king in exactly the same danger.
  const relief =
    defender &&
    defender.team !== team &&
    isAdjacent(to, king.position) &&
    !isKnownLoss(state, attackerHand, defender, to)
      ? KING_DANGER
      : 0;

  return left + joined + relief;
}

/** Whether a trap has already been sprung on `to`. Traps survive being triggered and are never
 *  revealed, so the tile — not the piece — is what carries the knowledge. */
function isSprungTrap(state: GameState, to: Position): boolean {
  return state.sprungTrapTiles.some((p) => p.row === to.row && p.col === to.col);
}

/** Whether attacking `defender` on `to` is a matchup already known to lose, from public
 *  information only. */
function isKnownLoss(state: GameState, attackerHand: RPSHand, defender: Piece, to: Position): boolean {
  if (isSprungTrap(state, to)) return true;
  if (!defender.revealed) return false; // unknown: a gamble, not a known loss
  if (defender.kind === 'trap') return true;
  if (defender.kind === 'king') return false; // taking the king wins outright, whatever the hands
  return defender.hand === LOSES_TO[attackerHand];
}

/** Revealed enemy soldiers adjacent to `square` whose known hand beats `attackerHand`. */
function threatsAt(
  state: GameState,
  team: Team,
  attackerHand: RPSHand,
  square: Position,
  excludeId: string | undefined,
): number {
  let count = 0;
  for (const piece of Object.values(state.pieces)) {
    if (piece.id === excludeId) continue;
    if (piece.team === team || !piece.alive || !piece.revealed || piece.kind !== 'soldier') continue;
    if (!isAdjacent(piece.position, square)) continue;
    if (piece.hand === LOSES_TO[attackerHand]) count++;
  }
  return count;
}

/** Whether `team` still has a living, unrevealed king on the board. */
function hasAliveUnrevealedKing(state: GameState, team: Team): boolean {
  return Object.values(state.pieces).some((p) => p.team === team && p.alive && !p.revealed && p.kind === 'king');
}

/** How many of `team`'s pieces are still alive and unrevealed right now — its king always among
 * them (while the game continues), its trap always too (a trap survives being sprung and is never
 * revealed), plus whichever soldiers haven't fought yet. */
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
