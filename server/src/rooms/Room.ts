import type { WebSocket } from 'ws';
import { BATTLE_SEQUENCE_MS, SETUP_SECONDS, TRAP_SEQUENCE_MS, TURN_SECONDS } from 'shared';
import type { BotDifficulty, ClientMessage, GameEvent, GameState, Position, ServerMessage, Team } from 'shared';
import { generateToken } from '../util/idgen.js';
import {
  autoFinalizeTeam,
  createInitialSetupData,
  initializeTeamPieces,
  markReady,
  placeSpecial,
  shuffleHands,
  type TeamSetupData,
} from '../game/setup.js';
import { findRandomLegalMove, legalMovesFor, validateMove } from '../game/movement.js';
import { applyMove } from '../game/combat.js';
import { autoFillTiePicks, startTieBreak, submitTiePick, tryResolveTieBreak, TIE_BREAK_WINDOW_MS } from '../game/tiebreak.js';
import { chooseBotMove, chooseBotTiePick } from '../game/bot.js';
import { toClientView } from '../game/view.js';

interface PlayerSlot {
  team: Team;
  token: string;
  socket: WebSocket | null;
  isBot?: boolean;
}

const OTHER_TEAM: Record<Team, Team> = { red: 'blue', blue: 'red' };

/** Randomized "thinking" delay before a bot acts — purely for pacing, so its moves don't feel
 * instant/robotic. Well under TURN_SECONDS (20s), so it always beats the human turn timer. */
const BOT_MIN_DELAY_MS = 900;
const BOT_MAX_DELAY_MS = 1800;
function botThinkingDelay(): number {
  return BOT_MIN_DELAY_MS + Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);
}

export class Room {
  readonly code: string;
  state: GameState;
  private setupData: Record<Team, TeamSetupData>;
  private players: Record<Team, PlayerSlot>;
  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private tieBreakTimer: ReturnType<typeof setTimeout> | null = null;
  private bot: { team: Team; difficulty: BotDifficulty } | null = null;

  constructor(code: string) {
    this.code = code;
    this.state = freshState(code);
    this.setupData = { red: createInitialSetupData(), blue: createInitialSetupData() };
    this.players = {
      red: { team: 'red', token: generateToken(), socket: null },
      blue: { team: 'blue', token: generateToken(), socket: null },
    };
  }

  get isFull(): boolean {
    return this.players.red.socket !== null && this.players.blue.socket !== null;
  }

  /**
   * Assigns the next open seat to a newly-connecting socket. `preferredTeam` (the room's host
   * choosing their side before the code is shared) is honored when that seat is still open;
   * otherwise falls back to a random pick among whatever's left, same as a plain joiner.
   */
  addPlayer(socket: WebSocket, preferredTeam?: Team): PlayerSlot | null {
    const openTeams = (['red', 'blue'] as Team[]).filter((t) => this.players[t].socket === null && !this.players[t].isBot);
    if (openTeams.length === 0) return null;

    const team =
      preferredTeam && openTeams.includes(preferredTeam)
        ? preferredTeam
        : openTeams[Math.floor(Math.random() * openTeams.length)];
    this.players[team].socket = socket;

    if (this.isFull && this.state.phase === 'lobby') this.startSetupPhase();
    return this.players[team];
  }

  findTeamByToken(token: string): Team | null {
    for (const team of ['red', 'blue'] as Team[]) {
      if (this.players[team].token === token) return team;
    }
    return null;
  }

  reattach(team: Team, socket: WebSocket): void {
    this.players[team].socket = socket;
  }

  detach(team: Team): void {
    this.players[team].socket = null;
    this.sendTo(OTHER_TEAM[team], { type: 'opponent-disconnected' });
  }

  notifyOpponentConnected(justJoinedTeam: Team): void {
    this.sendTo(OTHER_TEAM[justJoinedTeam], { type: 'opponent-connected' });
  }

  /**
   * Fills the other seat with a bot instead of waiting for a second human to join. Marks the
   * slot so `addPlayer` never seats a stray human into it, tells the human side "opponent
   * connected" (there's no real socket to ever emit that on its own), and starts setup directly
   * — `isFull` is gated on both sockets being non-null, which a bot's (permanently null) socket
   * would never satisfy.
   */
  setBot(team: Team, difficulty: BotDifficulty): void {
    this.players[team].isBot = true;
    this.bot = { team, difficulty };
    this.notifyOpponentConnected(team);
    if (this.state.phase === 'lobby') this.startSetupPhase();
  }

  // ─── Setup phase ──────────────────────────────────────────────────────

  private startSetupPhase(): void {
    this.state.phase = 'setup';
    for (const team of ['red', 'blue'] as Team[]) {
      initializeTeamPieces(this.state, team);
    }
    this.state.setupDeadline = Date.now() + SETUP_SECONDS * 1000;
    this.setupTimer = setTimeout(() => this.forceFinalizeSetup(), SETUP_SECONDS * 1000);
    // A bot is instantly "ready" — random king/trap placement and hand shuffle carry no
    // strategic signal the opponent could ever see, so there's nothing for difficulty to change
    // here. Play only actually begins once the human also readies up.
    if (this.bot) autoFinalizeTeam(this.state, this.setupData, this.bot.team);
    this.broadcast();
  }

  private forceFinalizeSetup(): void {
    for (const team of ['red', 'blue'] as Team[]) {
      autoFinalizeTeam(this.state, this.setupData, team);
    }
    this.beginPlayIfBothReady();
    this.broadcast();
  }

  private beginPlayIfBothReady(): void {
    if (this.state.phase === 'setup' && this.state.readiness.red && this.state.readiness.blue) {
      if (this.setupTimer) clearTimeout(this.setupTimer);
      this.setupTimer = null;
      this.state.phase = 'playing';
      this.state.turn = Math.random() < 0.5 ? 'red' : 'blue';
      this.startTurnTimer();
      this.scheduleBotTurnIfNeeded();
    }
  }

  // ─── Bot ──────────────────────────────────────────────────────────────

  private scheduleBotTurnIfNeeded(): void {
    if (!this.bot || this.state.phase !== 'playing' || this.state.tieBreak) return;
    if (this.state.turn !== this.bot.team) return;
    setTimeout(() => this.performBotMove(), botThinkingDelay());
  }

  private performBotMove(): void {
    if (!this.bot || this.state.phase !== 'playing' || this.state.tieBreak) return;
    if (this.state.turn !== this.bot.team) return; // stale timer from a since-resolved turn

    const move = chooseBotMove(this.state, this.bot.team, this.bot.difficulty);
    if (move) {
      this.performMove(move.pieceId, move.to);
    } else {
      // No legal move at all (fully boxed in) — mirrors handleTurnTimeout's own fallback.
      this.clearTurnTimer();
      this.state.turn = OTHER_TEAM[this.state.turn];
      this.startTurnTimer();
      this.scheduleBotTurnIfNeeded();
    }
    this.broadcast();
  }

  private scheduleBotTiePickIfNeeded(): void {
    if (!this.bot || !this.state.tieBreak) return;
    if (this.state.tieBreak.picks[this.bot.team] !== null) return;
    const attacker = this.state.pieces[this.state.tieBreak.attackerId];
    const defender = this.state.pieces[this.state.tieBreak.defenderId];
    if (attacker.team !== this.bot.team && defender.team !== this.bot.team) return;
    setTimeout(() => this.performBotTiePick(), botThinkingDelay());
  }

  private performBotTiePick(): void {
    if (!this.bot || !this.state.tieBreak) return;
    if (this.state.tieBreak.picks[this.bot.team] !== null) return; // e.g. auto-fill beat us to it

    const hand = chooseBotTiePick(this.state, this.bot.team, this.bot.difficulty);
    const err = submitTiePick(this.state, this.bot.team, hand);
    if (err) return;
    this.resolveTieBreakIfReady();
    this.broadcast();
  }

  // ─── Turn timer ───────────────────────────────────────────────────────

  private startTurnTimer(): void {
    this.clearTurnTimer();
    this.state.turnDeadline = Date.now() + TURN_SECONDS * 1000;
    this.turnTimer = setTimeout(() => this.handleTurnTimeout(), TURN_SECONDS * 1000);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.state.turnDeadline = null;
  }

  private handleTurnTimeout(): void {
    if (this.state.phase !== 'playing' || this.state.tieBreak || !this.state.turn) return;
    const move = findRandomLegalMove(this.state, this.state.turn);
    if (move) {
      this.performMove(move.pieceId, move.to);
    } else {
      // No legal move at all (fully boxed in) — just pass the turn.
      this.clearTurnTimer();
      this.state.turn = OTHER_TEAM[this.state.turn];
      this.startTurnTimer();
    }
    this.broadcast();
  }

  private performMove(pieceId: string, to: Position): void {
    const piece = this.state.pieces[pieceId];
    this.state.lastMove = { team: piece.team, position: to };
    const event = applyMove(this.state, piece, to);
    this.state.lastEvent = event;
    this.applyLastMoveOverride(event);
    this.afterMoveResolved(event);
  }

  /**
   * A move's destination tile is normally credited to whoever moved there — but if combat then
   * hands the tile to the other side instead (the defender wins a battle, or a trap claims the
   * attacker), the highlight should follow the tile's actual new owner, not the mover.
   */
  private applyLastMoveOverride(event: GameEvent | null): void {
    const position = this.state.lastMove?.position;
    if (!position) return;
    if (event?.type === 'battle' && event.outcome === 'defender-wins') {
      this.state.lastMove = { team: this.state.pieces[event.defenderId].team, position };
    } else if (event?.type === 'trap-triggered') {
      this.state.lastMove = { team: this.state.pieces[event.trapId].team, position };
    }
  }

  /** Common continuation after any move resolves, whether player-initiated or timeout-driven. */
  private afterMoveResolved(event: GameEvent | null): void {
    if (event?.type === 'tie-break-started') {
      startTieBreak(this.state, event.attackerId, event.defenderId);
      this.clearTurnTimer();
      this.scheduleTieBreakTimeout();
      this.scheduleBotTiePickIfNeeded();
      return;
    }
    this.clearTurnTimer();
    if (this.state.phase !== 'playing') return;

    this.state.turn = OTHER_TEAM[this.state.turn as Team];

    // King and Trap never move, so a side with zero living soldiers has no legal move ever
    // again — end the game right here instead of letting the turn timer spin uselessly.
    if (legalMovesFor(this.state, this.state.turn).length === 0) {
      const winner = OTHER_TEAM[this.state.turn];
      this.state.phase = 'gameover';
      this.state.winner = winner;
      this.state.lastEvent = { type: 'no-moves-left', winner };
      return;
    }

    if (event?.type === 'battle') {
      // The next turn's clock only starts once the winning cinematic + board resolve has had
      // time to finish playing on both clients — otherwise it'd already be ticking down while
      // the outcome is still animating in.
      setTimeout(() => {
        if (this.state.phase !== 'playing') return;
        this.startTurnTimer();
        this.scheduleBotTurnIfNeeded();
        this.broadcast();
      }, BATTLE_SEQUENCE_MS);
      return;
    }

    if (event?.type === 'trap-triggered') {
      // Same reasoning as the battle branch above: without this delay the opponent could move a
      // piece onto the vacated trap tile (or the attacker's own origin tile) before the client's
      // trap sequence finishes, and the client's position-keyed animation override would then
      // keep painting the stale dead piece there instead of the real new occupant.
      setTimeout(() => {
        if (this.state.phase !== 'playing') return;
        this.startTurnTimer();
        this.scheduleBotTurnIfNeeded();
        this.broadcast();
      }, TRAP_SEQUENCE_MS);
      return;
    }

    this.startTurnTimer();
    this.scheduleBotTurnIfNeeded();
  }

  // ─── Tie-break ────────────────────────────────────────────────────────

  private scheduleTieBreakTimeout(): void {
    this.clearTieBreakTimer();
    this.tieBreakTimer = setTimeout(() => this.handleTieBreakTimeout(), TIE_BREAK_WINDOW_MS);
  }

  private clearTieBreakTimer(): void {
    if (this.tieBreakTimer) clearTimeout(this.tieBreakTimer);
    this.tieBreakTimer = null;
  }

  private handleTieBreakTimeout(): void {
    if (!this.state.tieBreak) return;
    autoFillTiePicks(this.state);
    this.resolveTieBreakIfReady();
    this.broadcast();
  }

  private resolveTieBreakIfReady(): void {
    const event = tryResolveTieBreak(this.state);
    if (!event) return; // still waiting on one side
    this.state.lastEvent = event;
    if (event.type === 'tie-break-repeat') {
      this.scheduleTieBreakTimeout();
      this.scheduleBotTiePickIfNeeded();
    } else {
      this.applyLastMoveOverride(event);
      this.clearTieBreakTimer();
      this.afterMoveResolved(event);
    }
  }

  // ─── Rematch ──────────────────────────────────────────────────────────

  private resetForRematch(): void {
    if (this.setupTimer) clearTimeout(this.setupTimer);
    this.setupTimer = null;
    this.clearTurnTimer();
    this.clearTieBreakTimer();
    this.state = freshState(this.code);
    this.setupData = { red: createInitialSetupData(), blue: createInitialSetupData() };
    this.startSetupPhase();
  }

  // ─── Message dispatch ─────────────────────────────────────────────────

  handleMessage(team: Team, msg: ClientMessage): void {
    switch (msg.type) {
      case 'place-special': {
        const err = placeSpecial(this.state, this.setupData, team, msg.piece, msg.position);
        if (err) return this.sendTo(team, { type: 'error', message: err });
        break;
      }
      case 'shuffle-hands': {
        const err = shuffleHands(this.state, this.setupData, team);
        if (err) return this.sendTo(team, { type: 'error', message: err });
        break;
      }
      case 'ready': {
        const err = markReady(this.state, this.setupData, team);
        if (err) return this.sendTo(team, { type: 'error', message: err });
        this.beginPlayIfBothReady();
        break;
      }
      case 'move': {
        const err = validateMove(this.state, team, msg.pieceId, msg.to);
        if (err) return this.sendTo(team, { type: 'error', message: err });
        this.performMove(msg.pieceId, msg.to);
        break;
      }
      case 'tie-pick': {
        if (!this.state.tieBreak) return this.sendTo(team, { type: 'error', message: 'no-tie-break' });
        const err = submitTiePick(this.state, team, msg.hand);
        if (err) return this.sendTo(team, { type: 'error', message: err });
        this.resolveTieBreakIfReady();
        break;
      }
      case 'rematch': {
        if (this.state.phase !== 'gameover') return this.sendTo(team, { type: 'error', message: 'not-game-over' });
        this.resetForRematch();
        break;
      }
      default:
        return;
    }
    this.broadcast();
  }

  broadcast(): void {
    for (const team of ['red', 'blue'] as Team[]) {
      this.sendTo(team, { type: 'state', view: toClientView(this.state, team) });
    }
  }

  private sendTo(team: Team, message: ServerMessage): void {
    const socket = this.players[team].socket;
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}

function freshState(code: string): GameState {
  return {
    roomCode: code,
    phase: 'lobby',
    pieces: {},
    turn: null,
    setupDeadline: null,
    turnDeadline: null,
    tieBreak: null,
    readiness: { red: false, blue: false },
    winner: null,
    lastEvent: null,
    lastMove: null,
  };
}
