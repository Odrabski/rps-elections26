import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientGameView, ClientPieceView, GameEvent, Position, RPSHand, Team } from 'shared';
import { BOARD_COLS, BOARD_ROWS, TURN_SECONDS } from 'shared';
import { TEAM_THEME } from '../data/theme';
import { gameSeed } from '../data/characterAssets';
import { play } from '../utils/sfx';
import { useOpponentTease } from '../hooks/useOpponentTease';
import { CountdownRing } from './CountdownRing';
import { ExitButton } from './ExitButton';
import { HowToPlayButton } from './HowToPlayButton';
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

/** Map key for a board tile — positions are plain objects, so they can't be keyed on directly. */
function tileKey(p: Position): string {
  return `${p.row},${p.col}`;
}

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
  const fanfareTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = fanfareTimersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const seed = gameSeed(view);
  const myTurn = view.turn === team && !view.tieBreak;
  // Mirrors the server's own move guard (see validateMove): holding the turn isn't enough while
  // a battle/trap is still resolving — `turn` flips the moment combat starts, so without this
  // the board stays clickable for the whole length of the fight cinematic.
  // `activeEvent`/`cinematicPending` cover the same window locally, so the board locks on the
  // very frame the fight starts rather than waiting for the next broadcast to arrive.
  // `clashEvent` outlives `activeEvent` by the cloud's dissolve beat. Without it there's a window
  // where the cinematic is gone but the cloud is still on the board and a click would be accepted
  // — which then reuses the stale clash and dissolves the old tile to the wrong piece.
  const resolving =
    (view.resolvingUntil !== null && Date.now() < view.resolvingUntil) ||
    activeEvent !== null ||
    clashEvent !== null ||
    cinematicPending;
  const canMove = myTurn && !resolving;
  const alivePieces = useMemo(() => view.pieces.filter((p) => p.alive), [view.pieces]);
  /**
   * Occupancy indexed by tile. `getPieceAt` below is called once per cell while the board renders,
   * so doing it as a linear scan meant ~42 passes over every living piece per render — built once
   * here instead, and rebuilt only when the pieces actually change.
   */
  const pieceByTile = useMemo(() => {
    const map = new Map<string, ClientPieceView>();
    for (const p of alivePieces) map.set(tileKey(p.position), p);
    return map;
  }, [alivePieces]);
  /**
   * The score badges must not give the fight away. The server marks the loser dead in the very
   * same broadcast that starts the cinematic, so a live count dropped the instant a clash began —
   * telling you who lost a full ten seconds before the reveal did. Anyone caught up in a sequence
   * that's still playing out keeps counting until it finishes.
   */
  const scorePieces = useMemo(() => {
    const inFlight = new Set<string>();
    if (clashEvent) {
      inFlight.add(clashEvent.attacker.id);
      inFlight.add(clashEvent.defender.id);
    }
    // Only the attacker: the trap survives being sprung, so it never leaves the count in the
    // first place and has nothing to hold back.
    if (trapEvent) inFlight.add(trapEvent.attacker.id);
    if (inFlight.size === 0) return view.pieces;
    return view.pieces.map((p) => (inFlight.has(p.id) && !p.alive ? { ...p, alive: true } : p));
  }, [view.pieces, clashEvent, trapEvent]);
  const selected = alivePieces.find((p) => p.id === selectedId) ?? null;
  const opponentTeam: Team = team === 'red' ? 'blue' : 'red';
  // Only ordinary soldiers get a tease bubble — a king or trap "talking" would look wrong. An
  // opponent piece's `kind` is fog-of-war-hidden (undefined) until it's actually revealed in
  // combat, at which point it's indistinguishable from a soldier's own disguise anyway, so
  // "undefined" is included here too — only a *confirmed* revealed king/trap is excluded.
  const opponentSoldiers = useMemo(
    () => alivePieces.filter((p) => p.team === opponentTeam && p.kind !== 'king' && p.kind !== 'trap'),
    [alivePieces, opponentTeam],
  );
  const tease = useOpponentTease({ active: true, myTurn: canMove, opponentPieces: opponentSoldiers, opponentTeam });

  useEffect(() => {
    setSelectedId(null);
  }, [view.turn, view.tieBreak]);

  /**
   * Whether the weapon picker is actually on screen — the same condition it renders under, hoisted
   * so the sound can key off it.
   *
   * It used to sound the moment `view.tieBreak` arrived, which is the server's broadcast at the
   * *start* of the clash: a whole fight sequence before the player sees any tie, and an audible
   * spoiler of the outcome. Keyed to the panel appearing instead, and it still fires once per
   * round, since a repeat tie hides the panel behind its own cinematic and brings it back.
   */
  const tiePanelVisible = view.tieBreak !== null && !activeEvent && !cinematicPending;
  const hadTiePanel = useRef(false);
  useEffect(() => {
    if (tiePanelVisible && !hadTiePanel.current) play('fight.tie');
    hadTiePanel.current = tiePanelVisible;
  }, [tiePanelVisible]);

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

    if (event?.type === 'king-captured') {
      play('king.captured');
    }

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
      // The tile the fight happens on comes from *this* broadcast, not the snapshot.
      //
      // A defender never moves — combat.ts only ever assigns `attacker.position`, in every branch
      // — so its current position is the clash tile whatever the outcome. The snapshot is only
      // reliably one render old, and two broadcasts can land between commits (React batches; most
      // likely on a slow device, and during the first fight of a match while the board is still
      // mounting and preloading art). When that happened the cloud was drawn on the tile the
      // defender occupied a turn earlier — one square off the actual fight.
      const defenderNow = view.pieces.find((p) => p.id === event.defenderId);
      play('clash.impact');
      // Then the charge, in the gap the board already leaves before the cinematic: the jump and
      // cloud run for CLASH_REVEAL_DELAY_MS (1500ms) before "3" appears, so a 1.32s call started
      // just after the collision finishes exactly as the countdown begins. Nothing is retimed for
      // it — it fills a beat that was silent.
      const fanfare = setTimeout(() => play('fight.fanfare'), 160);
      fanfareTimersRef.current.add(fanfare);
      if (attackerBefore && defenderBefore) {
        setClashEvent({
          attacker: attackerBefore,
          defender: defenderBefore,
          targetPosition: defenderNow?.position ?? defenderBefore.position,
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
      const occupant = pieceByTile.get(tileKey(p));
      return !occupant || occupant.team !== team;
    });
  }, [selected, pieceByTile, team]);

  const handleTileClick = (actual: Position) => {
    if (!canMove) return;
    const occupant = pieceByTile.get(tileKey(actual));

    if (occupant && occupant.team === team && occupant.kind === 'soldier') {
      const next = occupant.id === selectedId ? null : occupant.id;
      if (next) play('piece.select');
      setSelectedId(next);
      return;
    }

    if (selected && legalTargets.some((t) => t.row === actual.row && t.col === actual.col)) {
      // Only a quiet move is sounded locally, for responsiveness — it produces no server event of
      // its own. A clash is left to the event branch below, which fires on both clients, so an
      // attacker doesn't hear it twice.
      if (!pieceByTile.get(tileKey(actual))) play('move.step');
      onMove(selected.id, actual);
      setSelectedId(null);
    }
  };

  const turnTeam = view.turn as Team;
  const turnTheme = TEAM_THEME[turnTeam];

  const handleExit = () => {
    if (window.confirm('לפרוש מהחיים הפוליטיים?')) onExit();
  };

  return (
    <div className="game-board-screen">
      <ExitButton onClick={handleExit} />
      {/* Mark only here — the words belong to setup, where there is room and a first-timer to tell. */}
      <HowToPlayButton compact />

      <div className="game-board-content">
        <ScoreHeader
          team={team}
          pieces={scorePieces}
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
        <div className="board-wrap">
          <BoardGrid
            team={team}
            seed={seed}
            getPieceAt={(actual) => pieceByTile.get(tileKey(actual))}
            isClickable={() => canMove}
            isLegalTarget={(actual) => legalTargets.some((t) => t.row === actual.row && t.col === actual.col)}
            isSelected={(piece) => piece.id === selectedId}
            onTileClick={handleTileClick}
            selectedPosition={selected?.position ?? null}
            trapEvent={trapEvent}
            clashEvent={clashEvent}
            lastMove={view.lastMove}
            tease={tease}
          />
        </div>

        <div
          // Keyed to canMove, not myTurn. `turn` flips the instant combat starts, so keying on it
          // began the beat behind a ten-second fight overlay — by the time the board was usable
          // the pill was deep in the quiet stretch and wouldn't beat again for up to 4.5s. This
          // restarts it the moment the board is actually yours, so the first thump lands ~180ms in.
          className={`turn-pill${canMove ? ' turn-pill-beating' : ''}`}
          style={{ background: turnTheme.solid }}
        >
          {view.tieBreak ? 'קרב הכרעה!' : myTurn ? 'התור שלך' : `תור ${turnTheme.label}`}
        </div>
      </div>

      {activeEvent && <CombatOverlay event={activeEvent} pieces={view.pieces} team={team} seed={seed} />}
      {/* Wait for the whole collision sequence — the on-board jump/cloud beat AND the intro/
          standoff/clash/tie-reveal cinematic — to finish before letting either player pick their
          next weapon, or the picker would pop up mid-animation. */}
      {tiePanelVisible && view.tieBreak && (
        <TieBreakPanel tieBreak={view.tieBreak} pieces={view.pieces} team={team} seed={seed} onPick={onTiePick} />
      )}
    </div>
  );
}
