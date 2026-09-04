import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BOARD_COLS,
  BOARD_ROWS,
  CLASH_JUMP_MS,
  CLASH_REVEAL_DELAY_MS,
  CLASH_DISSOLVE_MS,
  TRAP_WARNING_MS,
  TRAP_DISSOLVE_MS,
  TRAP_ATTACKER_JUMP_MS,
  TRAP_ATTACKER_FALL_MS,
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

type TrapPhase = 'warning' | 'trap-dissolve' | 'attacker-jump' | 'attacker-fall' | 'fallen';

/** Total lifetime of the trap sequence — GameBoard clears its `trapEvent` after this. Also used
 * by the server (Room.ts) to hold the next turn's timer off until this has finished playing. */
export { TRAP_SEQUENCE_MS };

type ClashPhase = 'jump' | 'in-cloud' | 'dissolving';

/** The clash beats now live in shared/constants.ts, since the server has to hold the board locked
 * for exactly as long as these run. Re-exported so existing importers are unaffected.
 * CLASH_JUMP_MS matches .piece-jumping / .piece-flinching (0.5s); CLASH_DISSOLVE_MS matches
 * .board-clash-cloud-dissolving. */
export { CLASH_JUMP_MS, CLASH_REVEAL_DELAY_MS, CLASH_DISSOLVE_MS };

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

  const gridRef = useRef<HTMLDivElement | null>(null);
  // Each live piece's actual position as of the *previous* render — comparing against this is
  // what detects an ordinary move (for the jump animation) a render later, once the new
  // position has already arrived from the server.
  const prevActualRef = useRef<Map<string, Position>>(new Map());
  /** Ordinary-move slides currently in flight, keyed by piece id (see the effect below). */
  const [jumps, setJumps] = useState<Map<string, { x: string; y: string }>>(new Map());
  const jumpTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = jumpTimersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);
  useEffect(() => {
    const next = new Map<string, Position>();
    const started: Array<{ id: string; offset: { x: string; y: string } }> = [];
    for (const { actual } of cells) {
      const p = getPieceAt(actual);
      if (!p) continue;
      next.set(p.id, actual);
      const prev = prevActualRef.current.get(p.id);
      if (prev && !samePos(prev, actual)) started.push({ id: p.id, offset: jumpOffset(prev, actual, team) });
    }
    prevActualRef.current = next;
    if (started.length === 0) return;

    // The jump used to be derived straight from prevActualRef during render — but this effect
    // overwrites that ref immediately, so the very next render (the idle-wobble timers alone
    // force one every few seconds) found no difference, dropped the .piece-jumping class and cut
    // the slide off mid-flight, leaving soldiers to teleport. Holding it in state for exactly the
    // animation's length makes it survive whatever else re-renders in the meantime.
    setJumps((current) => {
      const merged = new Map(current);
      for (const { id, offset } of started) merged.set(id, offset);
      return merged;
    });
    const timer = setTimeout(() => {
      setJumps((current) => {
        const merged = new Map(current);
        for (const { id } of started) merged.delete(id);
        return merged;
      });
    }, CLASH_JUMP_MS);
    jumpTimersRef.current.add(timer);
  });

  /**
   * Plays the idle wobble by toggling the class straight on the node.
   *
   * This used to be two pieces of React state, and each wobble's set-then-clear pair forced two
   * full re-renders of the entire board — four every cycle across both timers — where every one
   * re-walked all 42 cells and re-resolved every piece's artwork, purely to tilt a single figure
   * on a board where nothing had actually changed. Nothing about a decorative wobble belongs in
   * render state, so it doesn't live there any more.
   *
   * Only wraps whose className is exactly the base class are eligible, which is precisely the set
   * of pieces React isn't already animating — no stealing a piece mid-dissolve, mid-fall,
   * mid-flinch, or mid-pulse, and no fighting React over the same attribute.
   */
  const wobbleRandomPiece = useCallback((className: string) => {
    const grid = gridRef.current;
    if (!grid) return;
    const idle = Array.from(grid.querySelectorAll<HTMLElement>('.board-piece-wrap')).filter(
      (el) => el.className === 'board-piece-wrap',
    );
    if (idle.length === 0) return;
    const chosen = idle[Math.floor(Math.random() * idle.length)];
    chosen.classList.add(className);
    setTimeout(() => chosen.classList.remove(className), TILT_DURATION_MS);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = TILT_MIN_DELAY_MS + Math.random() * (TILT_MAX_DELAY_MS - TILT_MIN_DELAY_MS);
      timer = setTimeout(() => {
        if (cancelled) return;
        wobbleRandomPiece('board-piece-tilt');
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wobbleRandomPiece]);

  // A second, independent idle wobble — fixed 8s cadence (not randomized like the one above) and
  // tilted the opposite direction, so the board never reads as just one recurring animation.
  useEffect(() => {
    const interval = setInterval(() => wobbleRandomPiece('board-piece-tilt-reverse'), TILT_FIXED_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [wobbleRandomPiece]);

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
      // The tile is an empty hole from here on, and only now does the banner say what happened.
      setTimeout(
        () => setTrapPhase('fallen'),
        TRAP_WARNING_MS + TRAP_DISSOLVE_MS + TRAP_ATTACKER_JUMP_MS + TRAP_ATTACKER_FALL_MS,
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
      <div className="board-grid" ref={gridRef}>
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
            trapEvent &&
            atTrapTile &&
            (trapPhase === 'attacker-jump' || trapPhase === 'attacker-fall' || trapPhase === 'fallen');
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
          } else if (trapEvent && atTrapTile && trapPhase === 'fallen') {
            // Gone: the hole above is all that's left of either of them.
            piece = undefined;
          } else if (
            trapEvent &&
            atAttackerOrigin &&
            (trapPhase === 'warning' || trapPhase === 'trap-dissolve')
          ) {
            // Still standing at its own tile, untouched, while the trap plays out next to it.
            piece = trapEvent.attacker;
          } else if (piece) {
            jump = jumps.get(piece.id) ?? null;
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
                  className={[
                    'board-piece-anim',
                    jump ? 'piece-jumping' : '',
                    // The bubble lives inside this element, which sets a z-index and so opens its
                    // own stacking context — the bubble's own z-index can only rank it against its
                    // siblings, never against a nearer row's figure. Lifting the whole piece for
                    // the couple of seconds it's talking is what actually gets the bubble on top.
                    tease?.pieceId === piece.id ? 'board-piece-anim-teasing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
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
                      isPulsing ? 'board-piece-tilt' : '',
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
      {trapPhase === 'fallen' && trapEvent && (
        <div className="trap-warning-banner">
          {trapEvent.attacker.team === team ? 'מלכודת! נפלת בתרגיל פוליטי' : 'הופה! הפלת את היריב שלך בפח'}
        </div>
      )}
    </div>
  );
}
