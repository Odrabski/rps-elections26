import { useEffect, useState, type ReactNode } from 'react';
import { useGameSocket } from './hooks/useGameSocket';
import { HomeScreen } from './components/HomeScreen';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';
import { GameOverScreen } from './components/GameOverScreen';
import { SplashScreen } from './components/SplashScreen';
import { SoundToggle } from './components/SoundToggle';
import { ExitButton } from './components/ExitButton';
import { TEAM_THEME } from './data/theme';
import { preloadPieceAssets } from './utils/preloadAssets';
import { loadSession } from './utils/rejoin';
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
        <ExitButton onClick={leave} />
        <div className="lobby-panel panel">
          <h1 className="gradient-heading">ממתין לצד השני...</h1>
          <p className="lobby-hint">שלחו את הקוד הזה לצד השני:</p>
          <button
            type="button"
            className="lobby-code"
            aria-label="העתקת הקוד"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(roomCode);
              } catch {
                // Clipboard access can be refused (an insecure context, or a browser that just
                // says no) — the code is right there to read either way, so there's nothing to
                // recover from and nothing worth interrupting the player about.
                return;
              }
              setCodeCopied(true);
              setTimeout(() => setCodeCopied(false), 1600);
            }}
          >
            {roomCode}
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
          <p className="lobby-team" style={{ color: TEAM_THEME[team].text }}>
            אתם משחקים בתור {TEAM_THEME[team].label}
          </p>
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
      {!showSplash && <SoundToggle />}
      {content}
      <div className="app-version">v{APP_VERSION}</div>
    </>
  );
}
