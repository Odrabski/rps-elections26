import type { WebSocket } from 'ws';
import { SETUP_SECONDS, TIE_BREAK_SECONDS, TURN_SECONDS } from 'shared';
import type { ClientMessage, GameEvent, GameState, Position, ServerMessage, Team } from 'shared';
import { generateToken } from '../util/idgen.js';
import {
  autoFinalizeTeam,
  createInitialSetupData,
  markReady,
  placeSpecial,
  shuffleHands,
  type TeamSetupData,
} from '../game/setup.js';
import { findRandomLegalMove, validateMove } from '../game/movement.js';
import { applyMove } from '../game/combat.js';
import { autoFillTiePicks, startTieBreak, submitTiePick, tryResolveTieBreak } from '../game/tiebreak.js';
import { toClientView } from '../game/view.js';

interface PlayerSlot {
  team: Team;
  token: string;
  socket: WebSocket | null;
}

const OTHER_TEAM: Record<Team, Team> = { red: 'blue', blue: 'red' };

export class Room {
  readonly code: string;
  state: GameState;
  private setupData: Record<Team, TeamSetupData>;
  private players: Record<Team, PlayerSlot>;
  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private tieBreakTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Assigns the next open seat to a newly-connecting socket (random team for the room's host). */
  addPlayer(socket: WebSocket): PlayerSlot | null {
    const openTeams = (['red', 'blue'] as Team[]).filter((t) => this.players[t].socket === null);
    if (openTeams.length === 0) return null;

    const team = openTeams[Math.floor(Math.random() * openTeams.length)];
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

  // ─── Setup phase ──────────────────────────────────────────────────────

  private startSetupPhase(): void {
    this.state.phase = 'setup';
    this.state.setupDeadline = Date.now() + SETUP_SECONDS * 1000;
    this.setupTimer = setTimeout(() => this.forceFinalizeSetup(), SETUP_SECONDS * 1000);
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
    }
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
    const event = applyMove(this.state, piece, to);
    this.state.lastEvent = event;
    this.afterMoveResolved(event);
  }

  /** Common continuation after any move resolves, whether player-initiated or timeout-driven. */
  private afterMoveResolved(event: GameEvent | null): void {
    if (event?.type === 'tie-break-started') {
      startTieBreak(this.state, event.attackerId, event.defenderId);
      this.clearTurnTimer();
      this.scheduleTieBreakTimeout();
      return;
    }
    this.clearTurnTimer();
    if (this.state.phase === 'playing') {
      this.state.turn = OTHER_TEAM[this.state.turn as Team];
      this.startTurnTimer();
    }
  }

  // ─── Tie-break ────────────────────────────────────────────────────────

  private scheduleTieBreakTimeout(): void {
    this.clearTieBreakTimer();
    this.tieBreakTimer = setTimeout(() => this.handleTieBreakTimeout(), TIE_BREAK_SECONDS * 1000);
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
    } else {
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
  };
}
