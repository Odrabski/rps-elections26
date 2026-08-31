import type { BotDifficulty, ClientGameView, Position, RPSHand, Team } from './types.js';

export type ClientMessage =
  | { type: 'create-room'; team?: Team; vsBot?: boolean; botDifficulty?: BotDifficulty }
  | { type: 'join-room'; roomCode: string }
  | { type: 'rejoin'; roomCode: string; token: string }
  | { type: 'place-special'; piece: 'king' | 'trap'; position: Position }
  | { type: 'shuffle-hands' }
  | { type: 'ready' }
  | { type: 'move'; pieceId: string; to: Position }
  | { type: 'tie-pick'; hand: RPSHand }
  | { type: 'rematch' };

export type ServerMessage =
  | { type: 'room-created'; roomCode: string; team: Team; token: string }
  | { type: 'room-joined'; roomCode: string; team: Team; token: string }
  | { type: 'opponent-connected' }
  | { type: 'opponent-disconnected' }
  | { type: 'state'; view: ClientGameView }
  | { type: 'error'; message: string };
