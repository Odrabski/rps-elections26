import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientGameView, ClientPieceView, GameEvent, Position, RPSHand, Team } from 'shared';
import { BOARD_COLS, BOARD_ROWS, TURN_SECONDS } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { gameSeed } from '../data/characterAssets';
import { CountdownRing } from './CountdownRing';
import { ScoreHeader } from './ScoreHeader';
import { CombatOverlay } from './CombatOverlay';
import { FIGHT_SEQUENCE_MS, TIE_SEQUENCE_MS } from './FightSequence';
import { TieBreakPanel } from './TieBreakPanel';
import {
  BoardGrid,
  TRAP_SEQUENCE_MS,
  CLASH_REVEAL_DELAY_MS,
  CLASH_DISSOLVE_MS,
  type TrapEventInfo,
  type ClashEventInfo,
} from './BoardGrid';
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
  const [trapEvent, setTrapEvent] = useState<TrapEventInfo | null>(null);
  const [clashEvent, setClashEvent] = useState<ClashEventInfo | null>(null);
  // Every combatant's data as of the *previous* render — a 'battle' event's own broadcast already
  // has the outcome applied (loser dead, winner relocated), so this is the only place left to
  // read what the board looked like the instant before the fight.
  const prevPiecesRef = useRef<Map<string, ClientPieceView>>(new Map());
  // Mirrors clashEvent for the effect below to read without needing it as a dependency (that
  // effect is keyed on activeEvent instead, since it only cares about a cinematic ending).
  const clashEventRef = useRef<ClashEventInfo | null>(null);
  clashEventRef.current = clashEvent;
  // The event to reveal once a *fresh* clash's jump-into-the-cloud finishes — null once consumed.
  const pendingCinematicRef = useRef<GameEvent | null>(null);
  // True for the whole gap between queuing a fresh clash's cinematic and it actually appearing
  // (the jump + cloud-preview beat, CLASH_REVEAL_DELAY_MS) — a tie's weapon picker must stay
  // hidden through that gap too, not just while the cinematic itself (activeEvent) is showing,
  // or it would pop up early, overlapping the on-board jump/cloud animation.
  const [cinematicPending, setCinematicPending] = useState(false);

  const seed = gameSeed(view);
  const myTurn = view.turn === team && !view.tieBreak;
  const alivePieces = useMemo(() => view.pieces.filter((p) => p.alive), [view.pieces]);
  const selected = alivePieces.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [view.turn, view.tieBreak]);

  // Detecting a new event and reacting to it *synchronously during render* (React's documented
  // "adjusting state when a prop changes" pattern), rather than in a useEffect, matters here: an
  // effect only runs after the render that already shows the new (already-mutated) piece data has
  // committed — e.g. the attacker/trap already `alive: false` — so for one paintable frame the
  // board would show them missing before the override effect caught up and brought them back.
  // Setting state during render instead makes React redo the render before it ever commits.
  const eventKey = JSON.stringify(view.lastEvent);
  const [handledEventKey, setHandledEventKey] = useState<string | null>(null);
  if (eventKey !== handledEventKey) {
    setHandledEventKey(eventKey);
    const event = view.lastEvent;

    if (event?.type === 'trap-triggered') {
      // Both are looked up from *last render's* snapshot instead of this one: the server reveals
      // the trap's true kind and marks the attacker `revealed` in this same broadcast, but the
      // whole sequence is meant to still look exactly as it did before either of that happened —
      // the disguised soldier the trap always looked like, and the attacker in its normal (not
      // yet "exposed") colors — right up until it visibly falls into the hole.
      const attacker = prevPiecesRef.current.get(event.attackerId);
      const trap = prevPiecesRef.current.get(event.trapId);
      if (attacker && trap) setTrapEvent({ attacker, trap });
    } else if ((event?.type === 'battle' || event?.type === 'tie-break-started') && !clashEventRef.current) {
      // A fresh clash (no cloud on the board yet — a repeat, or the eventual decisive battle
      // after some ties, just falls through to the plain branch below instead) gets a jump onto
      // the target tile, then vanishes into a cloud that stays up for the whole encounter. Only
      // once that jump finishes does this event's own cinematic actually appear (see the
      // clashEvent effect further down).
      const attackerBefore = prevPiecesRef.current.get(event.attackerId);
      const defenderBefore = prevPiecesRef.current.get(event.defenderId);
      if (attackerBefore && defenderBefore) {
        setClashEvent({
          attacker: attackerBefore,
          defender: defenderBefore,
          targetPosition: defenderBefore.position,
          winner: null,
        });
        pendingCinematicRef.current = event;
        setCinematicPending(true);
      } else {
        setActiveEvent(event);
      }
    } else if (event && event.type !== 'king-captured' && event.type !== 'no-moves-left') {
      // Either the clash cloud is already up (a tie repeat, or the decisive battle that follows
      // one) and just needs its own cinematic shown right away, or this is some other event.
      setActiveEvent(event);
    }
  }

  // The actual dismiss timers live in their own effects, each keyed on the state they clear —
  // purely side-effecting, so unlike the detection above they're fine living in an effect.
  useEffect(() => {
    if (!trapEvent) return;
    const timer = setTimeout(() => setTrapEvent(null), TRAP_SEQUENCE_MS);
    return () => clearTimeout(timer);
  }, [trapEvent]);

  // A fresh clash only ever gets its jump-into-the-cloud once (pendingCinematicRef is cleared
  // right after being read), so this doesn't re-fire and re-jump when clashEvent later updates
  // to carry a winner — that transition is handled by the dissolve-clearing effect below instead.
  useEffect(() => {
    if (!clashEvent || clashEvent.winner || !pendingCinematicRef.current) return;
    const eventToShow = pendingCinematicRef.current;
    pendingCinematicRef.current = null;
    const timer = setTimeout(() => {
      setActiveEvent(eventToShow);
      setCinematicPending(false);
    }, CLASH_REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [clashEvent]);

  // Once GameBoard sets a winner on the clash (below), the cloud dissolves into it — clear the
  // whole clashEvent once that's had time to play out, handing rendering back to plain reality.
  useEffect(() => {
    if (!clashEvent?.winner) return;
    const timer = setTimeout(() => setClashEvent(null), CLASH_DISSOLVE_MS);
    return () => clearTimeout(timer);
  }, [clashEvent]);

  useEffect(() => {
    if (!activeEvent) return;
    // A tie's reveal ("תיקו!") is shown for much less time than a decisive win's — same
    // countdown/standoff/clash/cloud build-up, shorter reveal.
    const isTie = activeEvent.type === 'tie-break-started' || activeEvent.type === 'tie-break-repeat';
    const resolvingEvent = activeEvent;
    const timer = setTimeout(
      () => {
        // A decisive battle's cinematic just finished — if there's a clash cloud up (there always
        // should be, but a defensive check costs nothing), that's the cue to dissolve it into the
        // winner. A tie's own cinematic ending (repeat or otherwise) leaves the cloud untouched.
        if (resolvingEvent.type === 'battle' && clashEventRef.current) {
          const winnerId =
            resolvingEvent.outcome === 'attacker-wins' ? resolvingEvent.attackerId : resolvingEvent.defenderId;
          const winner = prevPiecesRef.current.get(winnerId);
          if (winner) {
            setClashEvent((current) => (current ? { ...current, winner } : current));
          } else {
            setClashEvent(null);
          }
        }
        setActiveEvent(null);
      },
      isTie ? TIE_SEQUENCE_MS : FIGHT_SEQUENCE_MS,
    );
    return () => clearTimeout(timer);
  }, [activeEvent]);

  // Runs after every render, so the synchronous check above always sees last render's pieces
  // first — refreshed here only once this render's snapshot is no longer needed.
  useEffect(() => {
    const next = new Map<string, ClientPieceView>();
    for (const p of view.pieces) next.set(p.id, p);
    prevPiecesRef.current = next;
  });

  const legalTargets = useMemo(() => {
    if (!selected) return [];
    const { row, col } = selected.position;
    return [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ].filter((p) => {
      if (p.row < 0 || p.row >= BOARD_ROWS || p.col < 0 || p.col >= BOARD_COLS) return false;
      // Matches the server's own validateMove: adjacent and in-bounds is legal onto an empty
      // tile or an enemy piece (that's an attack) — only your own piece blocks the move.
      const occupant = alivePieces.find((piece) => piece.position.row === p.row && piece.position.col === p.col);
      return !occupant || occupant.team !== team;
    });
  }, [selected, alivePieces, team]);

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

      <div className="game-board-content">
        <div className="turn-pill" style={{ background: turnTheme.solid }}>
          {view.tieBreak ? 'קרב הכרעה!' : myTurn ? 'התור שלך' : `תור ${turnTheme.label}`}
        </div>

        <div className="board-wrap">
          <BoardGrid
            team={team}
            seed={seed}
            getPieceAt={(actual) =>
              alivePieces.find((p) => p.position.row === actual.row && p.position.col === actual.col)
            }
            isClickable={() => myTurn}
            isLegalTarget={(actual) => legalTargets.some((t) => t.row === actual.row && t.col === actual.col)}
            isSelected={(piece) => piece.id === selectedId}
            onTileClick={handleTileClick}
            selectedPosition={selected?.position ?? null}
            trapEvent={trapEvent}
            clashEvent={clashEvent}
            lastMove={view.lastMove}
          />
        </div>

        <ScoreHeader
          team={team}
          pieces={view.pieces}
          center={
            <CountdownRing
              deadline={view.turnDeadline}
              totalSeconds={TURN_SECONDS}
              color={turnTheme.solid}
              size={88}
              numberWeight={500}
              numberSize="2.4rem"
              fallbackLabel="FIGHT"
            />
          }
        />
      </div>

      {activeEvent && <CombatOverlay event={activeEvent} pieces={view.pieces} team={team} seed={seed} />}
      {/* Wait for the whole collision sequence — the on-board jump/cloud beat AND the intro/
          standoff/clash/tie-reveal cinematic — to finish before letting either player pick their
          next weapon, or the picker would pop up mid-animation. */}
      {view.tieBreak && !activeEvent && !cinematicPending && (
        <TieBreakPanel tieBreak={view.tieBreak} pieces={view.pieces} team={team} seed={seed} onPick={onTiePick} />
      )}
    </div>
  );
}
