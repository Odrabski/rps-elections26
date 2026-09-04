import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGameSocket } from './hooks/useGameSocket';
import { HomeScreen } from './components/HomeScreen';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';
import { GameOverScreen } from './components/GameOverScreen';
import { SplashScreen } from './components/SplashScreen';
import { SoundToggle } from './components/SoundToggle';
import { setTrack } from './utils/music';
import { preloadPieceAssets } from './utils/preloadAssets';
import { copyText } from './utils/clipboard';
import { loadSession } from './utils/rejoin';
import { initAnalytics, trackGameEnded, trackGameStarted, trackTeamPicked, type GameMode } from './utils/analytics';
import { APP_VERSION } from './version';
import './App.css';

export default function App() {
  const [codeCopied, setCodeCopied] = useState(false);
  // Mobile browsers (Android Chrome especially) routinely discard a backgrounded tab under
  // memory pressure and reload it fresh from scratch the moment it's foregrounded again — with
  // no visible navigation, that looks to the player like the splash screen randomly popping up
  // mid-game for a second before the existing session reconnects. A saved session (see
  // rejoin.ts) is exactly the signal that this is one of those silent reloads, not a genuine
  // fresh launch, so the splash is skipped entirely in that case.
  const [showSplash, setShowSplash] = useState(() => !loadSession());

  const {
    status,
    roomCode,
    team,
    view,
    opponentConnected,
    errorMessage,
    vsBot,
    createRoom,
    joinRoom,
    placeSpecial,
    shuffleHands,
    ready,
    move,
    tiePick,
    rematch,
    resign,
    leave,
  } = useGameSocket();

  // ─── Analytics ────────────────────────────────────────────────────────
  // Driven off phase transitions rather than sprinkled through the handlers that cause them: the
  // same transitions happen on rejoin, on a rematch and on the bot path, and one place that watches
  // what actually became true cannot drift out of step with them the way five call sites would.
  useEffect(() => initAnalytics(), []);

  const gameStartedAt = useRef<number | null>(null);
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    const phase = view?.phase ?? null;
    if (phase === lastPhase.current) return;
    const previous = lastPhase.current;
    lastPhase.current = phase;

    const mode: GameMode = vsBot ? 'bot' : 'human';
    if (phase === 'setup' && team) trackTeamPicked(team, mode);
    if (phase === 'playing' && previous !== 'playing') {
      gameStartedAt.current = Date.now();
      trackGameStarted(mode);
    }
    if (phase === 'gameover' && view?.winner && team) {
      trackGameEnded({
        won: view.winner === team,
        reason: view.lastEvent?.type ?? 'unknown',
        seconds: gameStartedAt.current ? (Date.now() - gameStartedAt.current) / 1000 : 0,
      });
      gameStartedAt.current = null;
    }
  }, [view?.phase, view?.winner, view?.lastEvent, team, vsBot]);

  // Quitting mid-game concedes it first — otherwise the opponent is left on a board that never
  // resolves, with the server auto-playing random moves for the empty seat.
  const resignAndLeave = () => {
    resign();
    leave();
  };

  // Deferred until a seat is assigned rather than firing on app start: this pulls the sprite pool,
  // which has no business competing with the splash and fonts for a visitor who may never play.
  useEffect(() => {
    if (team) preloadPieceAssets(team);
  }, [team]);

  /**
   * Which looping track belongs to the screen you're on.
   *
   * The menu bed runs from the moment the splash clears until a match begins — home screen and
   * waiting room — and stops the instant pieces are being placed, since the board has its own
   * effects and an announcer over it. The result screen then gets its own, which is what plays
   * under the spinning heads or the rubble. Nothing during setup or play.
   */
  const track =
    showSplash ? null
    : view?.phase === 'gameover' ? (view.winner === team ? 'win' : 'lose')
    : !view || view.phase === 'lobby' ? 'menu'
    : null;
  useEffect(() => {
    setTrack(track);
    return () => setTrack(null);
  }, [track]);

  let content: ReactNode;

  if (!roomCode || !team) {
    content = <HomeScreen onCreate={createRoom} onJoin={joinRoom} errorMessage={errorMessage} />;
  } else if (!view || view.phase === 'lobby') {
    // A bot room moves past 'lobby' almost immediately (no real second player to wait for) — this
    // only ever shows for an instant, so it gets simple loading copy instead of the human-facing
    // "share this code" panel, which would make no sense here.
    content = vsBot ? (
      <div className="lobby-screen">
        <div className="lobby-panel panel">
          <h1 className="gradient-heading">מכינים את המשחק...</h1>
        </div>
      </div>
    ) : (
      <div className="lobby-screen">
        {/* No floating exit button here: the labelled way back sits in the panel below, and two
            controls doing the same thing on one small screen is just clutter. The other screens
            keep theirs — there you're leaving a game in progress, not a waiting room. */}
        <div className="lobby-panel panel">
          <h1 className="gradient-heading">ממתין לצד השני...</h1>
          <p className="lobby-hint">שלחו את הקוד הזה לצד השני:</p>
          <button
            type="button"
            className="lobby-code"
            aria-label="העתקת הקוד"
            onClick={async () => {
              // The icon is inside this button, so either half of it copies.
              if (!(await copyText(roomCode))) return;
              setCodeCopied(true);
              setTimeout(() => setCodeCopied(false), 1600);
            }}
          >
            <span className="lobby-code-text">{roomCode}</span>
            {/* Stroke-only and inheriting currentColor, so it reads as an affordance beside the
                code rather than a second thing competing with it for attention. */}
            <svg className="lobby-code-copy" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M5.5 15.5V5.5a2 2 0 0 1 2-2h10" />
            </svg>
          </button>
          {/* Always rendered so the panel doesn't jump a line taller when it appears. */}
          <span className={`lobby-copied${codeCopied ? ' lobby-copied-visible' : ''}`}>הקוד הועתק ✅</span>
          <a
            className="btn-primary lobby-share-btn"
            href={`https://wa.me/?text=${encodeURIComponent(
              `בואו לשחק אבניהו - מהדורת בחירות 2026!\nקוד המשחק: ${roomCode}\n${window.location.origin}`,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            שיתוף בוואטסאפ
          </a>
          <button type="button" className="btn-secondary lobby-back" onClick={leave}>
            חזרה למזנון הכנסת
          </button>
        </div>
      </div>
    );
  } else {
    content = (
      <>
        {status === 'reconnecting' ? (
          <div className="disconnect-banner">החיבור אבד — מתחברים מחדש...</div>
        ) : (
          !opponentConnected &&
          view.phase !== 'gameover' && (
            <div className="disconnect-banner">היריב התנתק — ממתין לחיבור מחדש...</div>
          )
        )}

        {view.phase === 'setup' && (
          <SetupScreen
            view={view}
            team={team}
            onPlaceSpecial={placeSpecial}
            onShuffle={shuffleHands}
            onReady={ready}
            onExit={resignAndLeave}
          />
        )}

        {view.phase === 'playing' && (
          <GameBoard view={view} team={team} onMove={move} onTiePick={tiePick} onExit={resignAndLeave} />
        )}

        {view.phase === 'gameover' && view.winner && (
          <GameOverScreen
            winner={view.winner}
            you={team}
            reason={view.lastEvent}
            onRematch={rematch}
            onBackToLobby={leave}
          />
        )}
      </>
    );
  }

  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      {/* Prominent everywhere except an actual match — on the board it goes back to being a
          small icon so it isn't sitting over the pieces asking for something all game. */}
      {!showSplash && <SoundToggle prominent={view?.phase !== 'setup' && view?.phase !== 'playing'} />}
      {content}
      <div className="app-version">v{APP_VERSION}</div>
    </>
  );
}
