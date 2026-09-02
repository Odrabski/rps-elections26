import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BOARD_COLS,
  BOARD_ROWS,
  TRAP_WARNING_MS,
  TRAP_DISSOLVE_MS,
  TRAP_ATTACKER_JUMP_MS,
  TRAP_SEQUENCE_MS,
} from 'shared';
import type { ClientPieceView, Position, Team } from 'shared';
import { PieceView } from './PieceView';
import { mirrorPosition } from '../utils/boardMirror';
import './BoardGrid.css';

/** Both pieces involved in a just-triggered trap, kept around purely for the dissolve sequence
 * below — server data already has them both `alive: false`, so `getPieceAt` alone can't find
 * them at their tiles anymore. */
export interface TrapEventInfo {
  attacker: ClientPieceView;
  trap: ClientPieceView;
}

/** A battle or tie clash in progress on the board — set the instant a fresh 'battle' or
 * 'tie-break-started' event arrives (not a repeat, since the soldiers are already "in" the cloud
 * for those) and lives for the whole encounter: the attacker jumps onto the target tile while the
 * defender flinches in place, both then vanish into a big tilted cloud that stays there — through
 * any number of tie repeats — until `winner` is finally set, at which point the cloud dissolves
 * to reveal it. */
export interface ClashEventInfo {
  attacker: ClientPieceView;
  defender: ClientPieceView;
  targetPosition: Position;
  winner: ClientPieceView | null;
}

interface BoardGridProps {
  team: Team;
  seed: string;
  getPieceAt: (actual: Position) => ClientPieceView | undefined;
  isClickable: (actual: Position) => boolean;
  isLegalTarget?: (actual: Position) => boolean;
  isSelected?: (piece: ClientPieceView) => boolean;
  onTileClick: (actual: Position) => void;
  /** Plays the same tilt wobble as the idle animation on this one tile — e.g. right after a
   * setup-phase King/Trap designation, so the promotion reads as a deliberate little "pop". */
  pulsePosition?: Position | null;
  /** The currently-selected piece's own tile — legal-target tiles get a directional arrow
   * pointing from here, on top of their usual highlight. */
  selectedPosition?: Position | null;
  /** Drives the one-time trap dissolve sequence (red flash → trap fades → attacker jumps onto
   * the tile → attacker fades) — set by GameBoard for the lifetime of a 'trap-triggered' event. */
  trapEvent?: TrapEventInfo | null;
  /** Drives the whole on-board clash sequence (attacker jumps in → both vanish into a persistent
   * cloud → cloud dissolves to the winner) — set by GameBoard for the lifetime of a battle/tie
   * encounter, spanning any number of tie repeats and their cinematic overlays. */
  clashEvent?: ClashEventInfo | null;
  /** The single most recently "won" tile and whose color it's highlighted in — always exactly
   * one tile, overwritten whenever another move (or a battle/trap override) claims a new one. */
  lastMove?: { team: Team; position: Position } | null;
  /** The one opponent piece (if any) currently popping an ambient taunt speech bubble — set by
   * GameBoard's useOpponentTease for a couple of seconds at a time, purely cosmetic. */
  tease?: { pieceId: string; text: string } | null;
}

const TILT_DURATION_MS = 700; // matches the longer of the two tilt animations (pieceTilt, 0.7s)
const TILT_MIN_DELAY_MS = 2500;
const TILT_MAX_DELAY_MS = 6000;
const TILT_FIXED_INTERVAL_MS = 8000;

type TrapPhase = 'warning' | 'trap-dissolve' | 'attacker-jump' | 'attacker-fall';

/** Total lifetime of the trap sequence — GameBoard clears its `trapEvent` after this. Also used
 * by the server (Room.ts) to hold the next turn's timer off until this has finished playing. */
export { TRAP_SEQUENCE_MS };

type ClashPhase = 'jump' | 'in-cloud' | 'dissolving';

/** Matches .piece-jumping's 0.5s / .piece-flinching's 0.5s — the attacker slides in and the
 * defender flinches in place, together, before either turns into the cloud. */
export const CLASH_JUMP_MS = 500;
/** How long the cloud sits alone on the board — no cinematic yet — once the jump above finishes,
 * so it actually reads as its own beat instead of appearing right as the screen cuts away. */
const CLASH_CLOUD_PREVIEW_MS = 1000;
/** GameBoard waits this long in total before showing a fresh clash's own cinematic. */
export const CLASH_REVEAL_DELAY_MS = CLASH_JUMP_MS + CLASH_CLOUD_PREVIEW_MS;
/** How long the cloud takes to dissolve into the winner once GameBoard sets `winner` — matches
 * .board-clash-cloud-dissolving's animation. GameBoard clears `clashEvent` after this. */
export const CLASH_DISSOLVE_MS = 400;

function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/** The one-cell direction a piece visually came from, expressed as the CSS custom properties
 * `pieceJump` (BoardGrid.css) animates from — always exactly one step on one axis, since a
 * soldier only ever moves to an adjacent tile. Computed in *display* space (post-mirroring) so
 * it reads correctly from whichever side is viewing. The board is RTL (index.html `dir="rtl"`),
 * so a higher column index sits further *left* on screen — translateX is a physical direction,
 * so the horizontal term is inverted relative to what plain column math would suggest. */
function jumpOffset(fromActual: Position, toActual: Position, team: Team): { x: string; y: string } {
  const from = mirrorPosition(fromActual, team);
  const to = mirrorPosition(toActual, team);
  return { x: `${(to.col - from.col) * 100}%`, y: `${(from.row - to.row) * 100}%` };
}

type ArrowDirection = 'up' | 'down' | 'left' | 'right';

/** Which way a legal-target tile sits relative to the selected piece, in on-screen terms.
 * Computed in *display* space for the same RTL reason as `jumpOffset` above: a higher column
 * index sits further left on screen, so it maps to a "left" arrow, not "right". */
function arrowDirection(fromActual: Position, toActual: Position, team: Team): ArrowDirection | null {
  const from = mirrorPosition(fromActual, team);
  const to = mirrorPosition(toActual, team);
  if (to.row < from.row) return 'up';
  if (to.row > from.row) return 'down';
  if (to.col > from.col) return 'left';
  if (to.col < from.col) return 'right';
  return null;
}

/**
 * The board surface: a background board image with two aligned overlays on top — an invisible
 * button grid (exact per-tile hit-testing, so overlapping piece art never steals a neighboring
 * tile's click) and a piece layer (pointer-events: none) where each figure is anchored by its
 * feet at its tile's vertical center and allowed to visually overflow into the row behind it.
 * Each figure carries its display row as `--piece-row`, which BoardGrid.css turns into an
 * explicit per-row z-index so a nearer row always paints over the row behind it — DOM order
 * alone used to imply the same thing, but it inverts the moment anything gives a single cell its
 * own stacking context.
 */
export function BoardGrid({
  team,
  seed,
  getPieceAt,
  isClickable,
  isLegalTarget,
  isSelected,
  onTileClick,
  pulsePosition,
  selectedPosition,
  trapEvent,
  clashEvent,
  lastMove,
  tease,
}: BoardGridProps) {
  const cells: { display: Position; actual: Position }[] = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      cells.push({ display: { row, col }, actual: mirrorPosition({ row, col }, team) });
    }
  }

  // Occasionally makes one random occupied tile's figure play a little idle wobble — never
  // more than one at a time. Reads the latest cells/getPieceAt via refs so the timer loop
  // itself only starts once, instead of restarting on every parent re-render.
  const [tiltKey, setTiltKey] = useState<string | null>(null);
  const cellsRef = useRef(cells);
  const getPieceAtRef = useRef(getPieceAt);
  // Each live piece's actual position as of the *previous* render — comparing against this is
  // what detects an ordinary move (for the jump animation) a render later, once the new
  // position has already arrived from the server.
  const prevActualRef = useRef<Map<string, Position>>(new Map());
  useEffect(() => {
    cellsRef.current = cells;
    getPieceAtRef.current = getPieceAt;

    const next = new Map<string, Position>();
    for (const { actual } of cells) {
      const p = getPieceAt(actual);
      if (p) next.set(p.id, actual);
    }
    prevActualRef.current = next;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = TILT_MIN_DELAY_MS + Math.random() * (TILT_MAX_DELAY_MS - TILT_MIN_DELAY_MS);
      timer = setTimeout(() => {
        if (cancelled) return;
        const occupied = cellsRef.current.filter((c) => getPieceAtRef.current(c.actual));
        if (occupied.length > 0) {
          const chosen = occupied[Math.floor(Math.random() * occupied.length)];
          const key = `${chosen.display.row}-${chosen.display.col}`;
          setTiltKey(key);
          setTimeout(() => {
            if (!cancelled) setTiltKey((current) => (current === key ? null : current));
          }, TILT_DURATION_MS);
        }
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // A second, independent idle wobble — fixed 8s cadence (not randomized like the one above) and
  // tilted the opposite direction, so the board never reads as just one recurring animation.
  const [tiltKey2, setTiltKey2] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(() => {
      const occupied = cellsRef.current.filter((c) => getPieceAtRef.current(c.actual));
      if (occupied.length > 0) {
        const chosen = occupied[Math.floor(Math.random() * occupied.length)];
        const key = `${chosen.display.row}-${chosen.display.col}`;
        setTiltKey2(key);
        setTimeout(() => {
          if (!cancelled) setTiltKey2((current) => (current === key ? null : current));
        }, TILT_DURATION_MS);
      }
    }, TILT_FIXED_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // The trap sequence's own phase clock — restarts whenever a genuinely new trapEvent arrives
  // (GameBoard clears it to null between events, so two distinct triggers always toggle through
  // null in between).
  const [trapPhase, setTrapPhase] = useState<TrapPhase | null>(null);
  // Setting the initial phase synchronously during render (not in the effect below) avoids a
  // one-frame blink: an effect only runs after the render that already shows the fresh trapEvent
  // has committed, and until trapPhase actually flips to 'warning' none of the piece-lookup
  // branches below match, so the trap tile would briefly render as if nothing were there.
  const trapEventRef = useRef<TrapEventInfo | null>(null);
  // Normalized to `| null` (never undefined) on both sides — trapEvent is an optional prop, so
  // comparing it directly against a ref initialized to `null` would never stabilize (undefined
  // !== null forever) and re-fire this setState on literally every render.
  const normalizedTrapEvent = trapEvent ?? null;
  if (normalizedTrapEvent !== trapEventRef.current) {
    trapEventRef.current = normalizedTrapEvent;
    setTrapPhase(normalizedTrapEvent ? 'warning' : null);
  }
  useEffect(() => {
    if (!trapEvent) return;
    const timers = [
      setTimeout(() => setTrapPhase('trap-dissolve'), TRAP_WARNING_MS),
      setTimeout(() => setTrapPhase('attacker-jump'), TRAP_WARNING_MS + TRAP_DISSOLVE_MS),
      setTimeout(
        () => setTrapPhase('attacker-fall'),
        TRAP_WARNING_MS + TRAP_DISSOLVE_MS + TRAP_ATTACKER_JUMP_MS,
      ),
    ];
    return () => timers.forEach(clearTimeout);
  }, [trapEvent]);

  // The clash's own phase clock: 'jump' while the attacker animates onto the target tile, then
  // 'in-cloud' for as long as the fight is undecided (through any number of tie repeats — this
  // phase has no timer of its own, it just waits for GameBoard to set a winner), then
  // 'dissolving' once GameBoard does — the cloud fades and the winner is exposed underneath.
  // Keyed on the clashEvent object itself, so setting `winner` (a new object) re-fires this and
  // jumps straight to 'dissolving', skipping stright past 'jump' for an already-in-progress clash.
  const [clashPhase, setClashPhase] = useState<ClashPhase | null>(null);
  // Same reasoning as trapPhase above: set synchronously during render so the very render that
  // first receives a fresh (or winner-updated) clashEvent already reflects the right phase,
  // instead of blinking empty for one frame while an effect catches up.
  const clashEventPhaseRef = useRef<ClashEventInfo | null>(null);
  // Same normalization as trapEvent above, for the same reason (clashEvent is also optional).
  const normalizedClashEvent = clashEvent ?? null;
  if (normalizedClashEvent !== clashEventPhaseRef.current) {
    clashEventPhaseRef.current = normalizedClashEvent;
    setClashPhase(!normalizedClashEvent ? null : normalizedClashEvent.winner ? 'dissolving' : 'jump');
  }
  useEffect(() => {
    if (!clashEvent || clashEvent.winner) return;
    const timer = setTimeout(() => setClashPhase('in-cloud'), CLASH_JUMP_MS);
    return () => clearTimeout(timer);
  }, [clashEvent]);

  return (
    <div className="board-frame">
      <div className="board-grid">
        {cells.map(({ display, actual }) => {
          const key = `${display.row}-${display.col}`;

          // The trap sequence temporarily overrides whatever the normal (alive-pieces-only)
          // lookup finds at the trap's own tile — both participants are already `alive: false`
          // there in the real data by the time this event arrives.
          const atTrapTile = trapEvent ? samePos(actual, trapEvent.trap.position) : false;
          // The attacker is already `alive: false` in the real data the instant this event
          // arrives, but it hasn't actually gone anywhere yet during 'warning'/'trap-dissolve' —
          // it's still standing right where it was when it made the move.
          const atAttackerOrigin = trapEvent ? samePos(actual, trapEvent.attacker.position) : false;
          // The clash sequence temporarily overrides both the attacker's own tile (it jumps away
          // from there, into the cloud) and the target tile (where the jump, the cloud, and the
          // eventual winner reveal all play out).
          const atClashOrigin = clashEvent ? samePos(actual, clashEvent.attacker.position) : false;
          const atClashTarget = clashEvent ? samePos(actual, clashEvent.targetPosition) : false;
          let piece = getPieceAt(actual);
          let dissolving = false;
          let falling = false;
          let jump: { x: string; y: string } | null = null;
          // Once the trap is spent, the tile itself becomes a hole for the rest of the sequence —
          // the attacker jumps onto it, then sinks into it.
          const showHole =
            trapEvent && atTrapTile && (trapPhase === 'attacker-jump' || trapPhase === 'attacker-fall');
          const showClashCloud =
            clashEvent && atClashTarget && (clashPhase === 'in-cloud' || clashPhase === 'dissolving');
          // The defender reacts in place — a quick flinch, not a dissolve — for exactly as long
          // as the attacker takes to jump in, then both turn into the cloud together.
          const defenderFlinch =
            clashEvent && atClashTarget && clashPhase === 'jump' ? clashEvent.defender : null;

          if (clashEvent && atClashTarget && clashPhase === 'jump') {
            piece = clashEvent.attacker;
            jump = jumpOffset(clashEvent.attacker.position, clashEvent.targetPosition, team);
          } else if (clashEvent && atClashTarget && clashPhase === 'dissolving') {
            // The cloud (rendered on top, fading out) is what visibly dissolves — the winner
            // underneath is just shown plainly, as if it had been standing there all along.
            piece = clashEvent.winner ?? undefined;
          } else if (clashEvent && (atClashOrigin || atClashTarget)) {
            // Mid-jump the origin is already empty; through 'in-cloud' both ends stay hidden
            // inside the cloud.
            piece = undefined;
          } else if (trapEvent && atTrapTile && trapPhase === 'warning') {
            piece = trapEvent.trap;
          } else if (trapEvent && atTrapTile && trapPhase === 'trap-dissolve') {
            piece = trapEvent.trap;
            dissolving = true;
          } else if (trapEvent && atTrapTile && trapPhase === 'attacker-jump') {
            piece = trapEvent.attacker;
            jump = jumpOffset(trapEvent.attacker.position, trapEvent.trap.position, team);
          } else if (trapEvent && atTrapTile && trapPhase === 'attacker-fall') {
            piece = trapEvent.attacker;
            falling = true;
          } else if (
            trapEvent &&
            atAttackerOrigin &&
            (trapPhase === 'warning' || trapPhase === 'trap-dissolve')
          ) {
            // Still standing at its own tile, untouched, while the trap plays out next to it.
            piece = trapEvent.attacker;
          } else if (piece) {
            const prevActual = prevActualRef.current.get(piece.id);
            if (prevActual && !samePos(prevActual, actual)) {
              jump = jumpOffset(prevActual, actual, team);
            }
          }

          const legal = isLegalTarget?.(actual) ?? false;
          const isPulsing = pulsePosition && samePos(actual, pulsePosition);
          const arrowDir = legal && selectedPosition ? arrowDirection(selectedPosition, actual, team) : null;
          const lastMoveTeam: Team | null =
            lastMove && samePos(actual, lastMove.position) ? lastMove.team : null;
          return (
            <div key={key} className="board-cell">
              <button
                type="button"
                className={[
                  'board-tile',
                  legal ? 'board-tile-legal' : '',
                  lastMoveTeam ? `board-tile-last-move-${lastMoveTeam}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onTileClick(actual)}
                disabled={!isClickable(actual)}
                aria-label={key}
              />
              {showHole && <img src="/assets/pieces/hole.webp" alt="" className="board-hole" />}
              {arrowDir && <span className={`board-arrow board-arrow-${arrowDir}`} aria-hidden="true" />}
              {defenderFlinch && (
                <div className="board-piece-anim" style={{ '--piece-row': display.row } as CSSProperties}>
                  <div className="board-piece-wrap piece-flinching">
                    <PieceView piece={defenderFlinch} team={team} seed={seed} mirrorAtEdge={display.col === 0} />
                  </div>
                </div>
              )}
              {piece && (
                <div
                  className={`board-piece-anim${jump ? ' piece-jumping' : ''}`}
                  style={
                    {
                      '--piece-row': display.row,
                      ...(jump ? { '--jump-from-x': jump.x, '--jump-from-y': jump.y } : {}),
                    } as CSSProperties
                  }
                >
                  <div
                    className={[
                      'board-piece-wrap',
                      tiltKey === key || isPulsing ? 'board-piece-tilt' : '',
                      tiltKey2 === key ? 'board-piece-tilt-reverse' : '',
                      dissolving ? 'piece-dissolving' : '',
                      falling ? 'piece-falling' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <PieceView
                      piece={piece}
                      team={team}
                      seed={seed}
                      selected={isSelected?.(piece) ?? false}
                      mirrorAtEdge={display.col === 0}
                    />
                    {tease?.pieceId === piece.id && (
                      <div className={`board-tease-bubble ${display.col <= 1 ? 'board-tease-bubble-left' : 'board-tease-bubble-right'}`}>
                        {tease.text}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showClashCloud && (
                <img
                  src="/assets/pieces/cloud2.webp"
                  alt=""
                  className={`board-clash-cloud${clashPhase === 'dissolving' ? ' board-clash-cloud-dissolving' : ''}`}
                />
              )}
            </div>
          );
        })}
      </div>
      {trapPhase === 'warning' && trapEvent && (
        <div className="trap-warning-banner">
          {trapEvent.attacker.team === team ? 'נפלת במלכודת' : 'היריב נפל במלכודת'}
        </div>
      )}
    </div>
  );
}
