import { useEffect, useRef, useState } from 'react';
import type { ClientPieceView, Team } from 'shared';
import { randomTease } from '../data/teases';

export interface TeaseState {
  pieceId: string;
  text: string;
}

const INTERVALS_MS = [10000, 15000];
const DISPLAY_MS = 2000;
const RETRY_MS = 1000;

interface UseOpponentTeaseParams {
  /** Whether the tease scheduler should be running at all (true throughout 'playing', false
   * once the game is over or the screen unmounts). */
  active: boolean;
  myTurn: boolean;
  opponentPieces: ClientPieceView[];
  opponentTeam: Team;
}

/**
 * Ambient board flavor: every so often, while it's the viewer's own turn, a random living
 * opponent piece pops a short political one-liner in a speech bubble for a couple of seconds.
 * Purely cosmetic and client-local — not synced with the opponent's client, never touches game
 * state — so this is a plain wall-clock scheduler, not server-driven.
 *
 * Individual turns are short (TURN_SECONDS = 20) and alternate constantly, so requiring that many
 * *continuous* seconds of my-turn could easily never occur naturally. Instead the clock runs
 * continuously regardless of whose turn it is, and each scheduled check is a gate: fire only if
 * it's currently my turn, otherwise keep retrying every ~1s (without disturbing the interval
 * alternation) until it is.
 */
export function useOpponentTease({ active, myTurn, opponentPieces, opponentTeam }: UseOpponentTeaseParams): TeaseState | null {
  const [tease, setTease] = useState<TeaseState | null>(null);

  const myTurnRef = useRef(myTurn);
  myTurnRef.current = myTurn;
  const opponentPiecesRef = useRef(opponentPieces);
  opponentPiecesRef.current = opponentPieces;
  const opponentTeamRef = useRef(opponentTeam);
  opponentTeamRef.current = opponentTeam;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    let intervalIndex = 0;

    const attempt = () => {
      if (cancelled) return;
      const pieces = opponentPiecesRef.current;
      if (myTurnRef.current && pieces.length > 0) {
        const piece = pieces[Math.floor(Math.random() * pieces.length)];
        const text = randomTease(opponentTeamRef.current);
        // A longer line needs a moment more to actually read — half a second extra past 4 words.
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        const displayMs = DISPLAY_MS + (wordCount > 4 ? 500 : 0);
        setTease({ pieceId: piece.id, text });
        clearTimer = setTimeout(() => {
          if (!cancelled) setTease(null);
        }, displayMs);

        const nextDelay = INTERVALS_MS[intervalIndex % INTERVALS_MS.length];
        intervalIndex += 1;
        timer = setTimeout(attempt, nextDelay);
      } else {
        timer = setTimeout(attempt, RETRY_MS);
      }
    };

    timer = setTimeout(attempt, INTERVALS_MS[0]);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (clearTimer) clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // A tease already showing must not linger into the opponent's turn — the 2s display timer
  // above only cancels it early, it doesn't dismiss it the instant the turn changes.
  useEffect(() => {
    if (!myTurn) setTease(null);
  }, [myTurn]);

  return tease;
}
