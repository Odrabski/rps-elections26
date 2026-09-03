import { BOARD_COLS, BOARD_ROWS } from 'shared';
import type { ClientMessage } from 'shared';

/**
 * The trust boundary for everything arriving over the wire. `JSON.parse` returns `any`, and
 * casting that straight to `ClientMessage` was letting malformed input reach game logic that
 * assumes it's already well-typed — which is how a bare `{"type":"join-room"}` could take the
 * whole process down, and how string coordinates could walk a piece onto an occupied tile
 * without a fight (the adjacency check coerces, the occupancy check doesn't).
 *
 * Returns the message narrowed to `ClientMessage`, or a short reason string to send back.
 */
export function validateClientMessage(raw: unknown): { ok: true; msg: ClientMessage } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad('malformed-message');

  const msg = raw as Record<string, unknown>;
  switch (msg.type) {
    case 'create-room':
      // Every field is optional here, but a present field still has to be the right shape.
      if (msg.team !== undefined && !isTeam(msg.team)) return bad('invalid-team');
      if (msg.vsBot !== undefined && typeof msg.vsBot !== 'boolean') return bad('invalid-vs-bot');
      if (msg.botDifficulty !== undefined && !isDifficulty(msg.botDifficulty)) return bad('invalid-difficulty');
      break;

    case 'join-room':
      if (!isCode(msg.roomCode)) return bad('invalid-room-code');
      break;

    case 'rejoin':
      if (!isCode(msg.roomCode)) return bad('invalid-room-code');
      if (!isToken(msg.token)) return bad('invalid-token');
      break;

    case 'place-special':
      if (msg.piece !== 'king' && msg.piece !== 'trap') return bad('invalid-piece-kind');
      if (!isPosition(msg.position)) return bad('invalid-position');
      break;

    case 'move':
      if (!isId(msg.pieceId)) return bad('invalid-piece-id');
      if (!isPosition(msg.to)) return bad('invalid-position');
      break;

    case 'tie-pick':
      if (msg.hand !== 'rock' && msg.hand !== 'paper' && msg.hand !== 'scissors') return bad('invalid-hand');
      break;

    case 'shuffle-hands':
    case 'ready':
    case 'rematch':
      break;

    default:
      return bad('unknown-message-type');
  }

  return { ok: true, msg: msg as unknown as ClientMessage };
}

function bad(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

/** Integers strictly inside the board. Rejects strings, floats, NaN and out-of-range values —
 * anything that would compare unequal to a real piece position under `===`. */
function isPosition(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { row, col } = value as Record<string, unknown>;
  return (
    typeof row === 'number' &&
    typeof col === 'number' &&
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < BOARD_ROWS &&
    col >= 0 &&
    col < BOARD_COLS
  );
}

function isTeam(value: unknown): boolean {
  return value === 'red' || value === 'blue';
}

function isDifficulty(value: unknown): boolean {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

/** Bounded so an oversized string can't be echoed around or used to grow state. */
function isCode(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 16;
}

function isToken(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/** Piece ids are looked up on a plain object, so reject the prototype-shaped keys outright
 * rather than relying on a later field check to reject `Object.prototype`. */
function isId(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  return value !== '__proto__' && value !== 'constructor' && value !== 'prototype';
}
