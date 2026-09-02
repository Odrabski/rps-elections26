import { describe, expect, it } from 'vitest';
import type { GameState, Piece, RPSHand, Team } from 'shared';
import { chooseBotMove } from './bot.js';
import { legalMovesFor } from './movement.js';

function makeState(pieces: Piece[], turn: Team = 'red'): GameState {
  const map: Record<string, Piece> = {};
  for (const p of pieces) map[p.id] = p;
  return {
    roomCode: 'TEST',
    phase: 'playing',
    pieces: map,
    turn,
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

function soldier(
  id: string,
  team: Team,
  hand: RPSHand,
  row: number,
  col: number,
  revealed = false,
): Piece {
  return { id, team, kind: 'soldier', hand, characterId: id, position: { row, col }, revealed, alive: true };
}

describe('chooseBotMove: easy', () => {
  it('always returns one of the currently legal moves', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3);
    const state = makeState([attacker]);

    const move = chooseBotMove(state, 'red', 'easy');
    const legal = legalMovesFor(state, 'red');

    expect(move).not.toBeNull();
    expect(legal).toContainEqual(move);
  });

  it('returns null when the team has no living soldiers left to move', () => {
    const deadSoldier = { ...soldier('a', 'red', 'rock', 2, 3), alive: false };
    const state = makeState([deadSoldier]);

    expect(chooseBotMove(state, 'red', 'easy')).toBeNull();
  });
});

describe('chooseBotMove: medium', () => {
  it('prefers a revealed favorable attack over a neutral empty-tile move', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3); // can attack (3,3) or step to (2,2)
    const defender = soldier('d', 'blue', 'scissors', 3, 3, true); // revealed — rock beats scissors
    const state = makeState([attacker, defender]);

    const move = chooseBotMove(state, 'red', 'medium');

    expect(move).toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });

  it('avoids a revealed unfavorable attack when a safe move exists', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3); // can attack (3,3) or step to (2,2)
    const defender = soldier('d', 'blue', 'paper', 3, 3, true); // revealed — paper beats rock
    const state = makeState([attacker, defender]);

    const move = chooseBotMove(state, 'red', 'medium');

    expect(move).not.toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });

  it('always attacks a revealed king regardless of hand', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3);
    const king: Piece = {
      id: 'k',
      team: 'blue',
      kind: 'king',
      hand: null,
      characterId: 'k',
      position: { row: 3, col: 3 },
      revealed: true,
      alive: true,
    };
    const state = makeState([attacker, king]);

    const move = chooseBotMove(state, 'red', 'medium');

    expect(move).toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });

  it('never attacks a revealed trap', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3);
    const trap: Piece = {
      id: 't',
      team: 'blue',
      kind: 'trap',
      hand: null,
      characterId: 't',
      position: { row: 3, col: 3 },
      revealed: true,
      alive: true,
    };
    const state = makeState([attacker, trap]);

    const move = chooseBotMove(state, 'red', 'medium');

    expect(move).not.toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });
});

describe('chooseBotMove: hard', () => {
  /**
   * Consumes 4 of blue's soldiers into "already revealed" with a given hand, so the residual
   * pool the hard bot deduces from is entirely determined by the test — mirrors what a human
   * could also legitimately track (revealing is permanent and public).
   */
  function revealedBlueSoldiers(hand: RPSHand, startId: string): Piece[] {
    return [0, 1, 2, 3].map((i) => soldier(`${startId}${i}`, 'blue', hand, 5, i, true));
  }

  it('attacks an unrevealed piece when the residual pool heavily favors the attacker', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3); // beats scissors, loses to paper
    const target = soldier('d', 'blue', 'scissors', 3, 3, false); // unrevealed — hand must not be read
    // Every already-revealed blue soldier is 'rock' or 'paper', leaving only 'scissors' hidden.
    const revealed = [...revealedBlueSoldiers('rock', 'r'), ...revealedBlueSoldiers('paper', 'p')];
    const state = makeState([attacker, target, ...revealed]);

    const move = chooseBotMove(state, 'red', 'hard');

    expect(move).toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });

  it('avoids an unrevealed piece when the residual pool heavily favors the defender', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3); // beats scissors, loses to paper
    const target = soldier('d', 'blue', 'paper', 3, 3, false); // unrevealed — hand must not be read
    // Every already-revealed blue soldier is 'rock' or 'scissors', leaving only 'paper' hidden.
    const revealed = [...revealedBlueSoldiers('rock', 'r'), ...revealedBlueSoldiers('scissors', 's')];
    const state = makeState([attacker, target, ...revealed]);

    const move = chooseBotMove(state, 'red', 'hard');

    expect(move).not.toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });

  it('still attacks an unrevealed piece with bad hand odds when it might be the king', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 3); // beats scissors, loses to paper
    const target = soldier('d', 'blue', 'paper', 3, 3, false); // unrevealed — hand must not be read
    // Same unfavorable residual pool as the test above (all revealed hands are rock/scissors,
    // leaving only paper hidden) — but this time blue's king is also still alive and unrevealed
    // somewhere else on the board, so `target` is genuinely one of only two possible pieces it
    // could be. That real ~50% chance of an instant win must outweigh the bad hand odds alone.
    const king: Piece = {
      id: 'k',
      team: 'blue',
      kind: 'king',
      hand: null,
      characterId: 'k',
      position: { row: 0, col: 0 },
      revealed: false,
      alive: true,
    };
    const revealed = [...revealedBlueSoldiers('rock', 'r'), ...revealedBlueSoldiers('scissors', 's')];
    const state = makeState([attacker, target, king, ...revealed]);

    const move = chooseBotMove(state, 'red', 'hard');

    expect(move).toEqual({ pieceId: 'a', to: { row: 3, col: 3 } });
  });

  it('walks a piece out from under a revealed enemy soldier that beats it', () => {
    // Rock is already standing next to a revealed paper: staying put isn't an option, but of the
    // squares it can run to, only one is clear of that same soldier's reach.
    const attacker = soldier('a', 'red', 'rock', 2, 3);
    const threat = soldier('t', 'blue', 'paper', 2, 4, true);
    const state = makeState([attacker, threat]);

    const move = chooseBotMove(state, 'red', 'hard');

    // (2,4) is the threat itself (a losing attack), (1,3)/(3,3) stay adjacent to nothing —
    // whichever it picks, it must not be the one square still next to the paper soldier.
    expect(move).not.toEqual({ pieceId: 'a', to: { row: 2, col: 4 } });
    const stillAdjacent = move && Math.abs(move.to.row - 2) + Math.abs(move.to.col - 4) === 1;
    expect(stillAdjacent).toBe(false);
  });

  it('moves in beside a revealed enemy soldier it beats, to take it next turn', () => {
    // Rock beats scissors. Stepping to (2,4) puts it next to the revealed scissors at (2,5)
    // without ever being in danger — strictly better than drifting somewhere neutral.
    const attacker = soldier('a', 'red', 'rock', 2, 3);
    const prey = soldier('p', 'blue', 'scissors', 2, 5, true);
    const state = makeState([attacker, prey]);

    const move = chooseBotMove(state, 'red', 'hard');

    expect(move).toEqual({ pieceId: 'a', to: { row: 2, col: 4 } });
  });

  it('keeps a soldier parked on the square guarding its own king', () => {
    // The guard is the only thing standing between the enemy and the king's one open approach.
    // Every move it has walks off that square, so it should sit tight and move the spare instead.
    const guard = soldier('g', 'red', 'rock', 2, 3);
    const king: Piece = {
      id: 'k', team: 'red', kind: 'king', hand: null, characterId: 'k',
      position: { row: 1, col: 3 }, revealed: false, alive: true,
    };
    const spare = soldier('s', 'red', 'rock', 5, 0);
    const state = makeState([guard, king, spare]);

    const move = chooseBotMove(state, 'red', 'hard');

    expect(move?.pieceId).toBe('s');
  });

  it('avoids stepping next to an already-revealed enemy soldier that would beat it', () => {
    const attacker = soldier('a', 'red', 'rock', 2, 6); // corner: only up/down/left are legal
    // Advancing straight down (row 3) would normally score highest of the three (see the plain
    // empty-tile advancement heuristic), but a revealed paper soldier sits right next to that
    // tile — paper beats rock, so it's a free piece for blue next turn. The bot should sidestep
    // to the (lower-scoring but safe) tile instead.
    const threat = soldier('t', 'blue', 'paper', 4, 6, true);
    const state = makeState([attacker, threat]);

    const move = chooseBotMove(state, 'red', 'hard');

    expect(move).not.toEqual({ pieceId: 'a', to: { row: 3, col: 6 } });
    expect(move).toEqual({ pieceId: 'a', to: { row: 2, col: 5 } });
  });
});
