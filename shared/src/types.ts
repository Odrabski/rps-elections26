export type Team = 'red' | 'blue';
export type RPSHand = 'rock' | 'paper' | 'scissors';
export type PieceKind = 'king' | 'trap' | 'soldier' | 'unassigned';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface Position {
  row: number;
  col: number;
}

/** Server-side truth for a single piece. Never sent to a client as-is. */
export interface Piece {
  id: string;
  team: Team;
  kind: PieceKind;
  hand: RPSHand | null; // null for king/trap
  characterId: string;
  position: Position;
  revealed: boolean; // flips true permanently once moved or battled
  alive: boolean;
}

export type GamePhase = 'lobby' | 'setup' | 'playing' | 'gameover';

export type GameEvent =
  | { type: 'battle'; attackerId: string; defenderId: string; outcome: 'attacker-wins' | 'defender-wins' }
  | { type: 'trap-triggered'; attackerId: string; trapId: string }
  | { type: 'king-captured'; winner: Team }
  | { type: 'no-moves-left'; winner: Team }
  | { type: 'resigned'; winner: Team }
  | { type: 'tie-break-started'; attackerId: string; defenderId: string }
  | { type: 'tie-break-repeat'; attackerId: string; defenderId: string; round: number };

/**
 * A tied clash (both soldiers showed the same hand) suspends normal play until both sides
 * pick again for just that tile — repeating on another tie — instead of eliminating both.
 * Server-side truth; never sent to a client as-is (see ClientTieBreakView).
 */
export interface TieBreakState {
  attackerId: string;
  defenderId: string;
  picks: Record<Team, RPSHand | null>;
  deadline: number; // epoch ms
  /** 1 for the original tie; incremented each time picks tie again ("the first rematch is #2"). */
  round: number;
}

/** Server-side truth for an entire match. Never serialized whole to a client. */
export interface GameState {
  roomCode: string;
  phase: GamePhase;
  pieces: Record<string, Piece>;
  turn: Team | null;
  setupDeadline: number | null; // epoch ms
  turnDeadline: number | null; // epoch ms
  tieBreak: TieBreakState | null;
  readiness: Record<Team, boolean>;
  winner: Team | null;
  lastEvent: GameEvent | null;
  /** The single most recently "won" tile — the mover's destination, unless combat there handed
   * the tile to someone else instead (a battle the defender won, or a trap's owner), in which
   * case it's overridden to that side's color instead. Null until anyone has moved this game. */
  lastMove: { team: Team; position: Position } | null;
  /** While a battle or trap is still playing out, the epoch-ms instant the board finishes
   * resolving. `turn` flips to the next player the moment combat starts (so the cinematic can
   * show who's up next), which would otherwise let them move pieces mid-fight — no move is
   * accepted until this passes. Null whenever nothing is resolving. */
  resolvingUntil: number | null;
  /** Tiles where a trap has been sprung at least once. A trap survives being triggered and is
   * never revealed, so this is the only record that one is there — it exists to give the bot the
   * memory a human has of watching a soldier die on that square (see bot.ts). Server-only:
   * deliberately absent from ClientGameView, which builds its output field by field. */
  sprungTrapTiles: Position[];
}

/** Fog-of-war-filtered view of a single piece, as seen by one recipient. */
export interface ClientPieceView {
  id: string;
  team: Team;
  position: Position;
  alive: boolean;
  kind?: PieceKind;
  hand?: RPSHand | null;
  characterId?: string;
  revealed: boolean;
}

/** Tie-break view for one recipient: never reveals the opponent's pick before both are in. */
export interface ClientTieBreakView {
  attackerId: string;
  defenderId: string;
  deadline: number;
  yourPick: RPSHand | null;
  opponentPicked: boolean;
  /** 1 for the original tie; incremented each further repeat ("the first rematch is #2"). */
  round: number;
}

/** The only game-state shape ever sent over the wire. */
export interface ClientGameView {
  roomCode: string;
  you: Team;
  phase: GamePhase;
  pieces: ClientPieceView[];
  turn: Team | null;
  setupDeadline: number | null;
  turnDeadline: number | null;
  tieBreak: ClientTieBreakView | null;
  readiness: Record<Team, boolean>;
  winner: Team | null;
  lastEvent: GameEvent | null;
  lastMove: { team: Team; position: Position } | null;
  /** See GameState.resolvingUntil — mirrored so the client can keep the board unclickable for
   * exactly as long as the server will keep rejecting moves. */
  resolvingUntil: number | null;
}
