import type { ClientGameView, ClientPieceView, ClientTieBreakView, GameState, Team } from 'shared';

/**
 * The fog-of-war security boundary: the only place allowed to turn full server truth into
 * what one specific client is allowed to see. A piece's kind/hand/characterId are included
 * only when it belongs to the recipient or has been revealed — everyone else just gets its
 * team, position, and alive/dead status. Tie-break picks follow the same rule: a recipient
 * sees their own pick and whether the opponent has picked, never the opponent's actual hand.
 */
export function toClientView(state: GameState, team: Team): ClientGameView {
  const pieces: ClientPieceView[] = Object.values(state.pieces).map((piece) => {
    const view: ClientPieceView = {
      id: piece.id,
      team: piece.team,
      position: piece.position,
      alive: piece.alive,
      revealed: piece.revealed,
    };
    if (piece.team === team || piece.revealed) {
      view.kind = piece.kind;
      view.hand = piece.hand;
      view.characterId = piece.characterId;
    }
    return view;
  });

  const otherTeam: Team = team === 'red' ? 'blue' : 'red';
  const tieBreak: ClientTieBreakView | null = state.tieBreak
    ? {
        attackerId: state.tieBreak.attackerId,
        defenderId: state.tieBreak.defenderId,
        deadline: state.tieBreak.deadline,
        yourPick: state.tieBreak.picks[team],
        opponentPicked: state.tieBreak.picks[otherTeam] !== null,
        round: state.tieBreak.round,
      }
    : null;

  return {
    roomCode: state.roomCode,
    you: team,
    phase: state.phase,
    pieces,
    turn: state.turn,
    setupDeadline: state.setupDeadline,
    turnDeadline: state.turnDeadline,
    tieBreak,
    readiness: state.readiness,
    winner: state.winner,
    lastEvent: state.lastEvent,
    lastMove: state.lastMove,
    resolvingUntil: state.resolvingUntil,
  };
}
