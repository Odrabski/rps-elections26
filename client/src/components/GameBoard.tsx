import { useEffect, useMemo, useState } from 'react';
import type { ClientGameView, GameEvent, Position, RPSHand, Team } from 'shared';
import { BOARD_COLS, BOARD_ROWS, TURN_SECONDS } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { CountdownRing } from './CountdownRing';
import { CombatOverlay } from './CombatOverlay';
import { TieBreakPanel } from './TieBreakPanel';
import { BoardGrid } from './BoardGrid';
import './GameBoard.css';

interface GameBoardProps {
  view: ClientGameView;
  team: Team;
  onMove: (pieceId: string, to: Position) => void;
  onTiePick: (hand: RPSHand) => void;
  onExit: () => void;
}

export function GameBoard({ view, team, onMove, onTiePick, onExit }: GameBoardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<GameEvent | null>(null);

  const myTurn = view.turn === team && !view.tieBreak;
  const alivePieces = useMemo(() => view.pieces.filter((p) => p.alive), [view.pieces]);
  const selected = alivePieces.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [view.turn, view.tieBreak]);

  useEffect(() => {
    const event = view.lastEvent;
    if (!event || event.type === 'king-captured') return;
    setActiveEvent(event);
    const isTie = event.type === 'tie-break-started' || event.type === 'tie-break-repeat';
    const delay = event.type === 'trap-triggered' ? 2000 : isTie ? 3000 : 2400;
    const timer = setTimeout(() => setActiveEvent(null), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(view.lastEvent)]);

  const legalTargets = useMemo(() => {
    if (!selected) return [];
    const { row, col } = selected.position;
    return [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ].filter((p) => p.row >= 0 && p.row < BOARD_ROWS && p.col >= 0 && p.col < BOARD_COLS);
  }, [selected]);

  const handleTileClick = (actual: Position) => {
    if (!myTurn) return;
    const occupant = alivePieces.find((p) => p.position.row === actual.row && p.position.col === actual.col);

    if (occupant && occupant.team === team && occupant.kind === 'soldier') {
      setSelectedId(occupant.id === selectedId ? null : occupant.id);
      return;
    }

    if (selected && legalTargets.some((t) => t.row === actual.row && t.col === actual.col)) {
      onMove(selected.id, actual);
      setSelectedId(null);
    }
  };

  const turnTeam = view.turn as Team;
  const turnTheme = TEAM_THEME[turnTeam];

  const handleExit = () => {
    if (window.confirm('לצאת מהמשחק? זו תיחשב פרישה מהמשחק.')) onExit();
  };

  return (
    <div className="game-board-screen">
      <button type="button" className="exit-btn" onClick={handleExit} aria-label="עזוב משחק">
        🚪
      </button>

      <div className="turn-banner" style={{ background: turnTheme.bg, borderColor: turnTheme.border }}>
        <span className="turn-banner-text" style={{ color: turnTheme.text }}>
          {view.tieBreak ? 'קרב הכרעה!' : myTurn ? 'התור שלך' : `תור ${turnTheme.label}`}
        </span>
        {!view.tieBreak && (
          <CountdownRing deadline={view.turnDeadline} totalSeconds={TURN_SECONDS} color={turnTheme.solid} size={44} />
        )}
      </div>

      <BoardGrid
        team={team}
        getPieceAt={(actual) =>
          alivePieces.find((p) => p.position.row === actual.row && p.position.col === actual.col)
        }
        isClickable={() => myTurn}
        isLegalTarget={(actual) => legalTargets.some((t) => t.row === actual.row && t.col === actual.col)}
        isSelected={(piece) => piece.id === selectedId}
        onTileClick={handleTileClick}
      />

      {activeEvent && <CombatOverlay event={activeEvent} pieces={view.pieces} team={team} />}
      {view.tieBreak && <TieBreakPanel tieBreak={view.tieBreak} pieces={view.pieces} onPick={onTiePick} />}
    </div>
  );
}
