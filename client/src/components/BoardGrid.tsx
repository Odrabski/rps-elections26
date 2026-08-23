import { useEffect, useRef, useState } from 'react';
import { BOARD_COLS, BOARD_ROWS } from 'shared';
import type { ClientPieceView, Position, Team } from 'shared';
import { PieceView } from './PieceView';
import { mirrorPosition } from '../utils/boardMirror';
import './BoardGrid.css';

interface BoardGridProps {
  team: Team;
  getPieceAt: (actual: Position) => ClientPieceView | undefined;
  isClickable: (actual: Position) => boolean;
  isLegalTarget?: (actual: Position) => boolean;
  isSelected?: (piece: ClientPieceView) => boolean;
  onTileClick: (actual: Position) => void;
}

const TILT_DURATION_MS = 700; // matches the longer of the two tilt animations (pieceTilt, 0.7s)
const TILT_MIN_DELAY_MS = 2500;
const TILT_MAX_DELAY_MS = 6000;

/**
 * The board surface: a background board image with two aligned overlays on top — an invisible
 * button grid (exact per-tile hit-testing, so overlapping piece art never steals a neighboring
 * tile's click) and a piece layer (pointer-events: none) where each figure is anchored by its
 * feet at its tile's vertical center and allowed to visually overflow into the row behind it.
 * Rows are rendered top-to-bottom in DOM order, so a lower (nearer) row's figure naturally
 * paints over the row behind it — no z-index bookkeeping needed.
 */
export function BoardGrid({ team, getPieceAt, isClickable, isLegalTarget, isSelected, onTileClick }: BoardGridProps) {
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
  useEffect(() => {
    cellsRef.current = cells;
    getPieceAtRef.current = getPieceAt;
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

  return (
    <div className="board-frame">
      <div className="board-grid">
        {cells.map(({ display, actual }) => {
          const piece = getPieceAt(actual);
          const legal = isLegalTarget?.(actual) ?? false;
          const key = `${display.row}-${display.col}`;
          return (
            <div key={key} className="board-cell">
              <button
                type="button"
                className={`board-tile${legal ? ' board-tile-legal' : ''}`}
                onClick={() => onTileClick(actual)}
                disabled={!isClickable(actual)}
                aria-label={key}
              />
              {piece && (
                <div className={`board-piece-wrap${tiltKey === key ? ' board-piece-tilt' : ''}`}>
                  <PieceView piece={piece} team={team} selected={isSelected?.(piece) ?? false} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
