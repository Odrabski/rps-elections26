import { describe, expect, it } from 'vitest';
import { validateClientMessage } from './validate.js';

/** Shorthand: did this input get through? */
function accepts(raw: unknown): boolean {
  return validateClientMessage(raw).ok;
}

describe('validateClientMessage', () => {
  it('accepts each well-formed message', () => {
    expect(accepts({ type: 'create-room' })).toBe(true);
    expect(accepts({ type: 'create-room', team: 'red', vsBot: true, botDifficulty: 'hard' })).toBe(true);
    expect(accepts({ type: 'join-room', roomCode: 'ABCD' })).toBe(true);
    expect(accepts({ type: 'rejoin', roomCode: 'ABCD', token: 'tok' })).toBe(true);
    expect(accepts({ type: 'place-special', piece: 'king', position: { row: 5, col: 3 } })).toBe(true);
    expect(accepts({ type: 'move', pieceId: 'red-piece-0', to: { row: 2, col: 3 } })).toBe(true);
    expect(accepts({ type: 'tie-pick', hand: 'rock' })).toBe(true);
    expect(accepts({ type: 'shuffle-hands' })).toBe(true);
    expect(accepts({ type: 'ready' })).toBe(true);
    expect(accepts({ type: 'rematch' })).toBe(true);
  });

  // Each of these used to reach game logic that assumed it was already well-typed, and threw —
  // which, in a single-process server, ended every game running on the box.
  it('rejects the shapes that used to crash the server', () => {
    expect(accepts(null)).toBe(false);
    expect(accepts('hello')).toBe(false);
    expect(accepts(42)).toBe(false);
    expect(accepts([])).toBe(false);
    expect(accepts({})).toBe(false);
    expect(accepts({ type: 'join-room' })).toBe(false); // roomCode undefined → .toUpperCase()
    expect(accepts({ type: 'nonsense' })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'red-piece-0', to: null })).toBe(false);
    expect(accepts({ type: 'place-special', piece: 'king' })).toBe(false); // position undefined
  });

  /**
   * The board's adjacency check does arithmetic (so `"2" - 2 === 0` passes) while its occupancy
   * check uses `===` (so `2 === "2"` fails). A string coordinate therefore looked like a legal
   * one-tile move onto an *empty* square, letting a piece walk onto the king or a defender with
   * no combat at all.
   */
  it('rejects non-integer coordinates that would phase through occupied tiles', () => {
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: '2', col: '3' } })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: 2.5, col: 3 } })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: true, col: 3 } })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: NaN, col: 3 } })).toBe(false);
    expect(accepts({ type: 'place-special', piece: 'trap', position: { row: '5', col: 3 } })).toBe(false);
  });

  it('rejects out-of-bounds coordinates', () => {
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: -1, col: 0 } })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: 6, col: 0 } })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'p', to: { row: 0, col: 7 } })).toBe(false);
  });

  /** An unknown hand made every `BEATS[...] === ...` comparison false, so resolution always fell
   * through to "attacker dies" — i.e. the defender won every tie-break on demand. */
  it('rejects a tie-break hand outside rock/paper/scissors', () => {
    expect(accepts({ type: 'tie-pick', hand: 'lizard' })).toBe(false);
    expect(accepts({ type: 'tie-pick', hand: '' })).toBe(false);
    expect(accepts({ type: 'tie-pick' })).toBe(false);
  });

  /** A bogus kind produced an immobile piece with no hand that killed every attacker it met. */
  it('rejects a piece kind outside king/trap', () => {
    expect(accepts({ type: 'place-special', piece: 'soldier', position: { row: 5, col: 0 } })).toBe(false);
    expect(accepts({ type: 'place-special', piece: 'zzz', position: { row: 5, col: 0 } })).toBe(false);
  });

  it('rejects prototype-shaped piece ids rather than relying on a later check', () => {
    expect(accepts({ type: 'move', pieceId: '__proto__', to: { row: 1, col: 1 } })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'constructor', to: { row: 1, col: 1 } })).toBe(false);
  });

  it('rejects malformed optional fields on create-room', () => {
    expect(accepts({ type: 'create-room', team: 'purple' })).toBe(false);
    expect(accepts({ type: 'create-room', botDifficulty: 'impossible' })).toBe(false);
    expect(accepts({ type: 'create-room', vsBot: 'yes' })).toBe(false);
  });

  it('rejects oversized strings', () => {
    expect(accepts({ type: 'join-room', roomCode: 'A'.repeat(500) })).toBe(false);
    expect(accepts({ type: 'rejoin', roomCode: 'ABCD', token: 'x'.repeat(500) })).toBe(false);
    expect(accepts({ type: 'move', pieceId: 'p'.repeat(200), to: { row: 1, col: 1 } })).toBe(false);
  });
});
