import type { BotDifficulty, ClientGameView, Position, RPSHand, Team } from './types.js';

export type ClientMessage =
  | { type: 'create-room'; team?: Team; vsBot?: boolean; botDifficulty?: BotDifficulty }
  | { type: 'join-room'; roomCode: string }
  | { type: 'rejoin'; roomCode: string; token: string }
  | { type: 'place-special'; piece: 'king' | 'trap'; position: Position }
  | { type: 'shuffle-hands' }
  | { type: 'reset-specials' }
  | { type: 'ready' }
  | { type: 'move'; pieceId: string; to: Position }
  /** `round` is the tie-break round this pick was made for. A repeat clears both picks, so
   *  without it a tap meant for the round you were looking at is accepted as the next one's. */
  | { type: 'tie-pick'; hand: RPSHand; round: number }
  | { type: 'rematch' }
  | { type: 'resign' };

export type ServerMessage =
  | { type: 'room-created'; roomCode: string; team: Team; token: string }
  | { type: 'room-joined'; roomCode: string; team: Team; token: string }
  | { type: 'opponent-connected' }
  | { type: 'opponent-disconnected' }
  | { type: 'state'; view: ClientGameView }
  | { type: 'error'; message: string };
